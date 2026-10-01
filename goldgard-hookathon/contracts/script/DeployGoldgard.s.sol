// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "forge-std/Script.sol";

import {PoolManager} from "v4-core/PoolManager.sol";
import {IPoolManager} from "v4-core/interfaces/IPoolManager.sol";
import {PoolKey} from "v4-core/types/PoolKey.sol";
import {Currency} from "v4-core/types/Currency.sol";
import {IHooks} from "v4-core/interfaces/IHooks.sol";
import {TickMath} from "v4-core/libraries/TickMath.sol";
import {LPFeeLibrary} from "v4-core/libraries/LPFeeLibrary.sol";

import {GoldgardHook} from "../src/GoldgardHook.sol";
import {OracleAdapter} from "../src/OracleAdapter.sol";
import {SafetyModule, IGoldgardClaimsView} from "../src/SafetyModule.sol";
import {HedgeReserve} from "../src/HedgeReserve.sol";
import {RewardDistributor} from "../src/RewardDistributor.sol";
import {GoldgardCallbackReceiver} from "../src/GoldgardCallbackReceiver.sol";
import {IChainlinkAggregatorV3} from "../src/interfaces/IChainlinkAggregatorV3.sol";
import {MockAggregatorV3} from "../src/mocks/MockAggregatorV3.sol";
import {IERC20} from "openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";

/// @title DeployGoldgard — chain-agnostic, production deploy of the Goldgard v4
///        hook corridor stack. Pluggable on ANY EVM chain: it reuses the chain's
///        canonical Uniswap v4 PoolManager when one is given, and otherwise stands
///        up its own — so the hook runs the same way whether or not canonical v4
///        is present (e.g. on Arc). No mock tokens and no demo liquidity seeding;
///        it wires REAL tokens passed by env, mines the hook's flag-encoded
///        address (CREATE2), initializes the USDC/local pool, and prints every
///        address to wire into the product's env.
///
/// Env:
///   PRIVATE_KEY               deployer/owner (optional; else --interactive/--sender)
///   POOL_MANAGER              existing Uniswap v4 PoolManager (optional; else deploy one)
///   USDC_ADDRESS              the USD leg (required)
///   LST_ADDRESS               the local-currency leg, e.g. cNGN (required)
///   USDC_DECIMALS             default 6
///   LST_DECIMALS              default 18
///   CHAINLINK_AGGREGATOR      USD/local price feed (optional; else a mock @ 1e8)
///   TICK_SPACING              default 60
///   REACTIVE_CALLBACK_PROXY   default: deployer
///   COVERAGE_CAP_BPS          default 10000
///
/// Example (any chain, testnet is fine for me; mainnet you run):
///   USDC_ADDRESS=0x… LST_ADDRESS=0x… forge script script/DeployGoldgard.s.sol:DeployGoldgard \
///     --rpc-url $RPC --broadcast --interactive
contract DeployGoldgard is Script {
    // The hook's permission flags, encoded in the low 14 bits of its address
    // (must match GoldgardHook's constructor: afterAddLiquidity, afterRemoveLiquidity,
    // beforeSwap, afterSwap, afterSwapReturnDelta).
    uint160 internal constant REQUIRED_FLAGS =
        (uint160(1) << 10) | (uint160(1) << 8) | (uint160(1) << 7) | (uint160(1) << 6) | (uint160(1) << 2);

    function run() external {
        address deployer = _startBroadcast();

        // 1. Uniswap v4 core: reuse the canonical PoolManager when provided, else
        //    deploy our own so the stack works on chains without canonical v4.
        address pmEnv = vm.envOr("POOL_MANAGER", address(0));
        IPoolManager manager = pmEnv != address(0) ? IPoolManager(pmEnv) : IPoolManager(address(new PoolManager(deployer)));

        // 2. Real tokens, sorted into currency0/1 by address (v4 requires c0 < c1).
        address usdc = vm.envAddress("USDC_ADDRESS");
        address lst = vm.envAddress("LST_ADDRESS");
        require(usdc != address(0) && lst != address(0) && usdc != lst, "bad tokens");
        uint8 usdcDec = uint8(vm.envOr("USDC_DECIMALS", uint256(6)));
        uint8 lstDec = uint8(vm.envOr("LST_DECIMALS", uint256(18)));
        (address c0, address c1, uint8 d0, uint8 d1) =
            usdc < lst ? (usdc, lst, usdcDec, lstDec) : (lst, usdc, lstDec, usdcDec);

        // 3. Price feed: real Chainlink when given, else a mock seeded at 1e8 that
        //    the owner can repoint later.
        address aggEnv = vm.envOr("CHAINLINK_AGGREGATOR", address(0));
        IChainlinkAggregatorV3 agg =
            aggEnv != address(0) ? IChainlinkAggregatorV3(aggEnv) : IChainlinkAggregatorV3(address(new MockAggregatorV3(8, 1e8)));

        // 4. Core contracts (USDC is the safety-vault collateral).
        OracleAdapter oracle = new OracleAdapter(deployer);
        SafetyModule safety = new SafetyModule(deployer, IERC20(usdc), "Goldgard Safety Vault", "gSAFE");
        HedgeReserve hedge = new HedgeReserve(deployer, manager, oracle);
        RewardDistributor rewards = new RewardDistributor(deployer);
        hedge.setMaxSpotOracleDeviationBps(uint16(_capUint(vm.envOr("MAX_SPOT_ORACLE_DEVIATION_BPS", uint256(10_000)), type(uint16).max)));

        // 5. Mine the flag-encoded address and deploy the hook via CREATE2.
        GoldgardHook hook = _deployHook(deployer, manager, oracle, safety, hedge, rewards);

        // 6. Wire dependencies + the callback receiver.
        oracle.setHook(address(hook));
        safety.setHook(address(hook));
        safety.setClaimsView(IGoldgardClaimsView(address(hook)));
        hedge.setHook(address(hook));
        rewards.setHook(address(hook));
        address proxy = vm.envOr("REACTIVE_CALLBACK_PROXY", deployer);
        GoldgardCallbackReceiver cb = new GoldgardCallbackReceiver(deployer, proxy, address(hook), address(safety));
        hook.setAuthorizedCaller(address(cb));
        safety.setAuthorizedCaller(address(cb));
        hook.setCoverageCapBps(_capUint(vm.envOr("COVERAGE_CAP_BPS", uint256(10_000)), 10_000));

        // 7. Pool key + oracle/pool config + init at tick 0.
        PoolKey memory key = PoolKey({
            currency0: Currency.wrap(c0),
            currency1: Currency.wrap(c1),
            fee: LPFeeLibrary.DYNAMIC_FEE_FLAG,
            tickSpacing: int24(int256(vm.envOr("TICK_SPACING", uint256(60)))),
            hooks: IHooks(address(hook))
        });
        oracle.setPoolOracleConfig(
            key,
            OracleAdapter.PoolOracleConfig({
                aggregator: agg,
                maxStaleSeconds: uint32(vm.envOr("CHAINLINK_MAX_STALE_SECONDS", uint256(3600))),
                maxPoolStaleSeconds: uint32(vm.envOr("POOL_MAX_STALE_SECONDS", uint256(3600))),
                aggregatorDecimals: uint8(vm.envOr("CHAINLINK_AGGREGATOR_DECIMALS", uint256(8))),
                token0Decimals: d0,
                token1Decimals: d1
            })
        );
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

        vm.stopBroadcast();

        console2.log("== Goldgard corridor stack ==");
        console2.log("chainId        ", block.chainid);
        console2.log("poolManager    ", address(manager));
        console2.log("hook           ", address(hook));
        console2.log("oracleAdapter  ", address(oracle));
        console2.log("safetyModule   ", address(safety));
        console2.log("hedgeReserve   ", address(hedge));
        console2.log("rewards        ", address(rewards));
        console2.log("callback       ", address(cb));
        console2.log("priceAggregator", address(agg));
        console2.log("currency0      ", c0);
        console2.log("currency1      ", c1);
    }

    function _deployHook(
        address deployer,
        IPoolManager manager,
        OracleAdapter oracle,
        SafetyModule safety,
        HedgeReserve hedge,
        RewardDistributor rewards
    ) internal returns (GoldgardHook hook) {
        bytes32 initCodeHash = keccak256(
            abi.encodePacked(
                type(GoldgardHook).creationCode, abi.encode(deployer, manager, oracle), abi.encode(safety, hedge, rewards)
            )
        );
        bytes32 salt = _findSalt(initCodeHash, REQUIRED_FLAGS, 200_000);
        hook = new GoldgardHook{salt: salt}(deployer, manager, oracle, safety, hedge, rewards);
    }

    function _findSalt(bytes32 initCodeHash, uint160 requiredFlags, uint256 maxAttempts)
        internal
        pure
        returns (bytes32 salt)
    {
        uint160 mask = uint160((1 << 14) - 1);
        for (uint256 i = 0; i < maxAttempts; i++) {
            salt = bytes32(i);
            address predicted = vm.computeCreate2Address(salt, initCodeHash);
            if ((uint160(predicted) & mask) == requiredFlags) return salt;
        }
        revert("hook salt not found");
    }

    function _capUint(uint256 v, uint256 max) internal pure returns (uint256) {
        return v > max ? max : v;
    }

    function _startBroadcast() internal returns (address deployer) {
        uint256 pk = vm.envOr("PRIVATE_KEY", uint256(0));
        if (pk != 0) {
            deployer = vm.addr(pk);
            vm.startBroadcast(pk);
        } else {
            vm.startBroadcast();
            deployer = tx.origin;
        }
    }
}
