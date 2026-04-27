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
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(pk);

        vm.startBroadcast(pk);

        PoolManager manager = new PoolManager(deployer);
        StateView stateView = new StateView(IUniPoolManager(address(manager)));

        MockERC20 token0 = new MockERC20("LST", "LST", 18);
        MockERC20 token1 = new MockERC20("USDC", "USDC", 18);
        token0.mint(deployer, 1_000_000e18);
        token1.mint(deployer, 1_000_000e18);

        MockAggregatorV3 agg = new MockAggregatorV3(8, 1e8);

        OracleAdapter oracle = new OracleAdapter(deployer);
        SafetyModule safety = new SafetyModule(deployer, IERC20(address(token1)), "Goldgard Safety Vault", "gSAFE");
        HedgeReserve hedge = new HedgeReserve(deployer, oracle);
        RewardDistributor rewards = new RewardDistributor(deployer);

        uint160 requiredFlags = (uint160(1) << 10) | (uint160(1) << 7) | (uint160(1) << 6) | (uint160(1) << 2);

        bytes memory initCode = abi.encodePacked(
            type(GoldgardHook).creationCode,
            abi.encode(deployer, IPoolManager(address(manager)), oracle, safety, hedge, rewards)
        );

        (bytes32 salt,) = HookMiner.findSalt(deployer, keccak256(initCode), requiredFlags, 200_000);
        GoldgardHook hook =
            new GoldgardHook{salt: salt}(deployer, IPoolManager(address(manager)), oracle, safety, hedge, rewards);

        oracle.setHook(address(hook));
        safety.setHook(address(hook));
        safety.setClaimsView(IGoldgardClaimsView(address(hook)));
        hedge.setHook(address(hook));
        rewards.setHook(address(hook));

        PoolKey memory key = PoolKey({
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

        PoolModifyLiquidityTestNoChecks liqRouter = new PoolModifyLiquidityTestNoChecks(manager);
        SwapRouterNoChecks swapRouter = new SwapRouterNoChecks(manager);

        token0.approve(address(liqRouter), type(uint256).max);
        token1.approve(address(liqRouter), type(uint256).max);
        token0.approve(address(swapRouter), type(uint256).max);
        token1.approve(address(swapRouter), type(uint256).max);

        token0.mint(address(hedge), 500_000e18);
        token1.mint(address(hedge), 500_000e18);

        int24 lower = TickMath.minUsableTick(key.tickSpacing);
        int24 upper = TickMath.maxUsableTick(key.tickSpacing);

        ModifyLiquidityParams memory lp =
            ModifyLiquidityParams({tickLower: lower, tickUpper: upper, liquidityDelta: 10_000e18, salt: bytes32(0)});
        liqRouter.modifyLiquidity(key, lp, abi.encodePacked(deployer));

        string memory root = "demo";
        vm.serializeUint(root, "chainId", block.chainid);
        vm.serializeAddress(root, "deployer", deployer);
        vm.serializeAddress(root, "poolManager", address(manager));
        vm.serializeAddress(root, "stateView", address(stateView));
        vm.serializeAddress(root, "hook", address(hook));
        vm.serializeAddress(root, "oracleAdapter", address(oracle));
        vm.serializeAddress(root, "safetyModule", address(safety));
        vm.serializeAddress(root, "hedgeReserve", address(hedge));
        vm.serializeAddress(root, "rewards", address(rewards));
        vm.serializeAddress(root, "swapRouter", address(swapRouter));
        vm.serializeAddress(root, "liquidityRouter", address(liqRouter));
        vm.serializeAddress(root, "token0", address(token0));
        vm.serializeAddress(root, "token1", address(token1));
        vm.serializeAddress(root, "mockAggregator", address(agg));
        vm.serializeUint(root, "tickSpacing", uint256(uint24(uint32(int32(key.tickSpacing)))));
        vm.serializeUint(root, "fee", uint256(key.fee));
        vm.serializeUint(root, "minTick", uint256(uint24(uint32(int32(lower)))));
        string memory json = vm.serializeUint(root, "maxTick", uint256(uint24(uint32(int32(upper)))));

        vm.writeJson(json, "../frontend/app/config/demoConfig.local.json");

        vm.stopBroadcast();
    }
}
