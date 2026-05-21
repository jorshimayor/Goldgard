// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "forge-std/Script.sol";

import {PoolManager} from "v4-core/PoolManager.sol";
import {IPoolManager} from "v4-core/interfaces/IPoolManager.sol";
import {PoolKey} from "v4-core/types/PoolKey.sol";
import {Currency} from "v4-core/types/Currency.sol";
import {IHooks} from "v4-core/interfaces/IHooks.sol";
import {ModifyLiquidityParams} from "v4-core/types/PoolOperation.sol";
import {TickMath} from "v4-core/libraries/TickMath.sol";
import {LPFeeLibrary} from "v4-core/libraries/LPFeeLibrary.sol";

import {PoolModifyLiquidityTestNoChecks} from "v4-core/test/PoolModifyLiquidityTestNoChecks.sol";
import {SwapRouterNoChecks} from "v4-core/test/SwapRouterNoChecks.sol";

import {MockERC20} from "solmate/src/test/utils/mocks/MockERC20.sol";

import {StateView} from "v4-periphery/lens/StateView.sol";
import {IPoolManager as IUniPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";

import {GoldgardHook} from "../src/GoldgardHook.sol";
import {OracleAdapter} from "../src/OracleAdapter.sol";
import {SafetyModule} from "../src/SafetyModule.sol";
import {HedgeReserve} from "../src/HedgeReserve.sol";
import {RewardDistributor} from "../src/RewardDistributor.sol";
import {GoldgardCallbackReceiver} from "../src/GoldgardCallbackReceiver.sol";
import {IChainlinkAggregatorV3} from "../src/interfaces/IChainlinkAggregatorV3.sol";
import {MockAggregatorV3} from "../src/mocks/MockAggregatorV3.sol";
import {IGoldgardClaimsView} from "../src/SafetyModule.sol";
import {IERC20} from "openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";

library HookMiner {
    error HookAddressNotFound();

    function computeCreate2(address deployer, bytes32 salt, bytes32 initCodeHash) internal pure returns (address addr) {
        bytes32 h = keccak256(abi.encodePacked(bytes1(0xff), deployer, salt, initCodeHash));
        addr = address(uint160(uint256(h)));
    }

    function findSalt(address deployer, bytes32 initCodeHash, uint160 requiredFlags, uint256 maxAttempts)
        internal
        pure
        returns (bytes32 salt, address hookAddress)
    {
        uint160 mask = uint160((1 << 14) - 1);

        for (uint256 i = 0; i < maxAttempts; i++) {
            salt = bytes32(i);
            hookAddress = computeCreate2(deployer, salt, initCodeHash);
            if ((uint160(hookAddress) & mask) == requiredFlags) return (salt, hookAddress);
        }

        revert HookAddressNotFound();
    }
}

contract DeployDemo is Script {
    using LPFeeLibrary for uint24;

    function run() external {
        address deployer = _startBroadcast();
        _deployCore(deployer);
        hook = _deployHookCreate2(deployer, manager, oracle, safety, hedge, rewards);
        _wireDependencies(deployer);
        _initPoolAndLiquidity(deployer);
        _writeConfig(deployer);
        vm.stopBroadcast();
    }

    PoolManager internal manager;
    StateView internal stateView;
    MockERC20 internal token0;
    MockERC20 internal token1;
    MockAggregatorV3 internal agg;
    OracleAdapter internal oracle;
    SafetyModule internal safety;
    HedgeReserve internal hedge;
    RewardDistributor internal rewards;
    GoldgardHook internal hook;
    GoldgardCallbackReceiver internal callbackReceiver;
    PoolModifyLiquidityTestNoChecks internal liqRouter;
    SwapRouterNoChecks internal swapRouter;
    PoolKey internal key;
    int24 internal lower;
    int24 internal upper;

    function _startBroadcast() internal returns (address deployer) {
        uint256 pk = _privateKeyOrZero();
        if (pk != 0) {
            deployer = vm.addr(pk);
            vm.startBroadcast(pk);
        } else {
            vm.startBroadcast();
            deployer = tx.origin;
        }
    }

    function _deployCore(address deployer) internal {
        manager = new PoolManager(deployer);
        stateView = new StateView(IUniPoolManager(address(manager)));

        uint64 nonce = vm.getNonce(deployer);
        address predicted0 = vm.computeCreateAddress(deployer, uint256(nonce));
        address predicted1 = vm.computeCreateAddress(deployer, uint256(nonce) + 1);
        bool lstFirst = predicted0 < predicted1;

        if (lstFirst) {
            token0 = new MockERC20("LST", "LST", 18);
            token1 = new MockERC20("USDC", "USDC", 18);
        } else {
            token1 = new MockERC20("USDC", "USDC", 18);
            token0 = new MockERC20("LST", "LST", 18);
        }

        token0.mint(deployer, 1_000_000e18);
        token1.mint(deployer, 1_000_000e18);

        agg = new MockAggregatorV3(8, 1e8);
        oracle = new OracleAdapter(deployer);
        safety = new SafetyModule(
            deployer,
            IERC20(address(token1)),
            "Goldgard Safety Vault",
            "gSAFE"
        );
        hedge = new HedgeReserve(deployer, IPoolManager(address(manager)), oracle);
        rewards = new RewardDistributor(deployer);

        uint256 maxDevBps = vm.envOr(
            "MAX_SPOT_ORACLE_DEVIATION_BPS",
            uint256(10_000)
        );
        if (maxDevBps == 0) maxDevBps = 10_000;
        if (maxDevBps > type(uint16).max) maxDevBps = type(uint16).max;
        hedge.setMaxSpotOracleDeviationBps(uint16(maxDevBps));
    }

    function _wireDependencies(address deployer) internal {
        oracle.setHook(address(hook));
        safety.setHook(address(hook));
        safety.setClaimsView(IGoldgardClaimsView(address(hook)));
        hedge.setHook(address(hook));
        rewards.setHook(address(hook));

        address reactiveCallbackProxy = vm.envOr(
            "REACTIVE_CALLBACK_PROXY",
            deployer
        );
        callbackReceiver = new GoldgardCallbackReceiver(
            deployer,
            reactiveCallbackProxy,
            address(hook),
            address(safety)
        );
        hook.setAuthorizedCaller(address(callbackReceiver));
        safety.setAuthorizedCaller(address(callbackReceiver));
    }

    function _initPoolAndLiquidity(address deployer) internal {
        key = PoolKey({
            currency0: Currency.wrap(address(token0)),
            currency1: Currency.wrap(address(token1)),
            fee: LPFeeLibrary.DYNAMIC_FEE_FLAG,
            tickSpacing: 60,
            hooks: IHooks(address(hook))
        });

        OracleAdapter.PoolOracleConfig memory oCfg = OracleAdapter.PoolOracleConfig({
            aggregator: IChainlinkAggregatorV3(address(agg)),
            maxStaleSeconds: 3600,
            aggregatorDecimals: 8,
            token0Decimals: 18,
            token1Decimals: 18
        });
        oracle.setPoolOracleConfig(key, oCfg);

        GoldgardHook.PoolConfig memory cfg;
        cfg.baseLpFee = 500;
        cfg.maxLpFee = 5000;
        cfg.feeSlopeBps = 1;
        cfg.deviationBps = 50;
        cfg.circuitBreakerBps = 200;
        cfg.rebalanceBps = 5000;
        cfg.twapWindowSeconds = 60;
        cfg.circuitBreakerCooldownSeconds = 1800;
        hook.setPoolConfig(key, cfg);

        manager.initialize(key, TickMath.getSqrtPriceAtTick(0));

        liqRouter = new PoolModifyLiquidityTestNoChecks(manager);
        swapRouter = new SwapRouterNoChecks(manager);

        token0.approve(address(liqRouter), type(uint256).max);
        token1.approve(address(liqRouter), type(uint256).max);
        token0.approve(address(swapRouter), type(uint256).max);
        token1.approve(address(swapRouter), type(uint256).max);

        token0.mint(address(hedge), 500_000e18);
        token1.mint(address(hedge), 500_000e18);

        lower = TickMath.minUsableTick(key.tickSpacing);
        upper = TickMath.maxUsableTick(key.tickSpacing);

        ModifyLiquidityParams memory lp = ModifyLiquidityParams({
            tickLower: lower,
            tickUpper: upper,
            liquidityDelta: 10_000e18,
            salt: bytes32(0)
        });
        liqRouter.modifyLiquidity(key, lp, abi.encodePacked(deployer));
    }

    function _writeConfig(address deployer) internal {
        string memory root = "demo";
        vm.serializeUint(root, "chainId", block.chainid);
        vm.serializeAddress(root, "deployer", deployer);
        vm.serializeAddress(root, "poolManager", address(manager));
        vm.serializeAddress(root, "stateView", address(stateView));
        vm.serializeAddress(root, "hook", address(hook));
        vm.serializeAddress(root, "callbackReceiver", address(callbackReceiver));
        vm.serializeAddress(root, "oracleAdapter", address(oracle));
        vm.serializeAddress(root, "safetyModule", address(safety));
        vm.serializeAddress(root, "hedgeReserve", address(hedge));
        vm.serializeAddress(root, "rewards", address(rewards));
        vm.serializeAddress(root, "swapRouter", address(swapRouter));
        vm.serializeAddress(root, "liquidityRouter", address(liqRouter));
        vm.serializeAddress(root, "token0", address(token0));
        vm.serializeAddress(root, "token1", address(token1));
        vm.serializeAddress(root, "mockAggregator", address(agg));
        vm.serializeUint(
            root,
            "tickSpacing",
            uint256(uint24(uint32(int32(key.tickSpacing))))
        );
        vm.serializeUint(root, "fee", uint256(key.fee));
        vm.serializeUint(root, "minTick", uint256(uint24(uint32(int32(lower)))));
        string memory json = vm.serializeUint(
            root,
            "maxTick",
            uint256(uint24(uint32(int32(upper))))
        );

        string memory outPath = block.chainid == 31337
            ? "../frontend/app/config/demoConfig.local.json"
            : "../frontend/app/config/demoConfig.sepolia.json";
        vm.writeJson(json, outPath);
    }

    function _deployHookCreate2(
        address deployer,
        PoolManager manager_,
        OracleAdapter oracle_,
        SafetyModule safety_,
        HedgeReserve hedge_,
        RewardDistributor rewards_
    ) internal returns (GoldgardHook hook_) {
        uint160 requiredFlags = (uint160(1) << 10) |
            (uint160(1) << 8) |
            (uint160(1) << 7) |
            (uint160(1) << 6) |
            (uint160(1) << 2);

        bytes32 initCodeHash = keccak256(
            abi.encodePacked(
                type(GoldgardHook).creationCode,
                abi.encode(deployer, IPoolManager(address(manager_)), oracle_),
                abi.encode(safety_, hedge_, rewards_)
            )
        );

        (bytes32 salt, ) = _findSalt(initCodeHash, requiredFlags, 200_000);
        hook_ = new GoldgardHook{salt: salt}(
            deployer,
            IPoolManager(address(manager_)),
            oracle_,
            safety_,
            hedge_,
            rewards_
        );
    }

    function _findSalt(
        bytes32 initCodeHash,
        uint160 requiredFlags,
        uint256 maxAttempts
    ) internal pure returns (bytes32 salt, address hookAddress) {
        uint160 mask = uint160((1 << 14) - 1);
        for (uint256 i = 0; i < maxAttempts; i++) {
            salt = bytes32(i);
            hookAddress = vm.computeCreate2Address(salt, initCodeHash);
            if ((uint160(hookAddress) & mask) == requiredFlags)
                return (salt, hookAddress);
        }
        revert HookMiner.HookAddressNotFound();
    }

    function _privateKeyOrZero() internal view returns (uint256 pk) {
        string memory raw = vm.envOr("PRIVATE_KEY", string(""));
        if (bytes(raw).length == 0) return 0;
        string memory trimmed = _trimLeft(raw);
        if (bytes(trimmed).length == 0) return 0;
        return vm.parseUint(trimmed);
    }

    function _trimLeft(string memory s) internal pure returns (string memory) {
        bytes memory b = bytes(s);
        uint256 i = 0;
        while (i < b.length) {
            bytes1 c = b[i];
            if (c != 0x20 && c != 0x09 && c != 0x0a && c != 0x0d) break;
            unchecked {
                i++;
            }
        }
        if (i == 0) return s;
        bytes memory out = new bytes(b.length - i);
        for (uint256 j = 0; j < out.length; j++) {
            out[j] = b[i + j];
        }
        return string(out);
    }
}
