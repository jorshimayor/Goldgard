// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "forge-std/StdInvariant.sol";

import {IERC20} from "openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";

import {PoolManager} from "v4-core/PoolManager.sol";
import {IPoolManager} from "v4-core/interfaces/IPoolManager.sol";
import {PoolKey} from "v4-core/types/PoolKey.sol";
import {Currency} from "v4-core/types/Currency.sol";
import {IHooks} from "v4-core/interfaces/IHooks.sol";
import {ModifyLiquidityParams, SwapParams} from "v4-core/types/PoolOperation.sol";
import {TickMath} from "v4-core/libraries/TickMath.sol";
import {LPFeeLibrary} from "v4-core/libraries/LPFeeLibrary.sol";

import {PoolModifyLiquidityTestNoChecks} from "v4-core/test/PoolModifyLiquidityTestNoChecks.sol";
import {SwapRouterNoChecks} from "v4-core/test/SwapRouterNoChecks.sol";

import {MockERC20} from "solmate/src/test/utils/mocks/MockERC20.sol";

import {GoldgardHook} from "../src/GoldgardHook.sol";
import {OracleAdapter} from "../src/OracleAdapter.sol";
import {SafetyModule} from "../src/SafetyModule.sol";
import {IGoldgardClaimsView} from "../src/SafetyModule.sol";
import {HedgeReserve} from "../src/HedgeReserve.sol";
import {RewardDistributor} from "../src/RewardDistributor.sol";
import {IChainlinkAggregatorV3} from "../src/interfaces/IChainlinkAggregatorV3.sol";

import {MockAggregatorV3} from "./mocks/MockAggregatorV3.sol";
import {HookMiner} from "./utils/HookMiner.sol";

contract GoldgardHandler {
    PoolKey public key;
    SwapRouterNoChecks public swapRouter;
    SafetyModule public safety;
    MockERC20 public token0;
    MockERC20 public token1;

    constructor(
        PoolKey memory _key,
        SwapRouterNoChecks _swapRouter,
        SafetyModule _safety,
        MockERC20 _token0,
        MockERC20 _token1
    ) {
        key = _key;
        swapRouter = _swapRouter;
        safety = _safety;
        token0 = _token0;
        token1 = _token1;
    }

    function swapExactIn0(uint256 amount) external {
        amount = bound(amount, 1e12, 1e18);
        token0.mint(address(this), amount);
        token0.approve(address(swapRouter), amount);

        SwapParams memory p = SwapParams({
            zeroForOne: true, amountSpecified: -int256(amount), sqrtPriceLimitX96: TickMath.MIN_SQRT_PRICE + 1
        });

        swapRouter.swap(key, p);
    }

    function swapExactIn1(uint256 amount) external {
        amount = bound(amount, 1e12, 1e18);
        token1.mint(address(this), amount);
        token1.approve(address(swapRouter), amount);

        SwapParams memory p = SwapParams({
            zeroForOne: false, amountSpecified: -int256(amount), sqrtPriceLimitX96: TickMath.MAX_SQRT_PRICE - 1
        });

        swapRouter.swap(key, p);
    }

    function bound(uint256 x, uint256 min, uint256 max) internal pure returns (uint256) {
        if (x < min) return min;
        if (x > max) return max;
        return x;
    }
}

contract GoldgardHookInvariantTest is StdInvariant, Test {
    using LPFeeLibrary for uint24;

    PoolManager internal manager;
    PoolModifyLiquidityTestNoChecks internal liqRouter;
    SwapRouterNoChecks internal swapRouter;

    MockERC20 internal token0;
    MockERC20 internal token1;

    MockAggregatorV3 internal agg;
    OracleAdapter internal oracle;
    SafetyModule internal safety;
    HedgeReserve internal hedge;
    RewardDistributor internal rewards;
    GoldgardHook internal hook;
    PoolKey internal key;

    GoldgardHandler internal handler;
    uint256 internal safetyAssetsAtStart;

    function setUp() public {
        manager = new PoolManager(address(this));
        liqRouter = new PoolModifyLiquidityTestNoChecks(manager);
        swapRouter = new SwapRouterNoChecks(manager);

        token0 = new MockERC20("LST", "LST", 18);
        token1 = new MockERC20("USDC", "USDC", 18);
        token0.mint(address(this), 1_000_000e18);
        token1.mint(address(this), 1_000_000e18);

        oracle = new OracleAdapter(address(this));
        safety = new SafetyModule(address(this), IERC20(address(token1)), "Goldgard Safety Vault", "gSAFE");
        hedge = new HedgeReserve(address(this), oracle);
        rewards = new RewardDistributor(address(this));

        uint160 requiredFlags = (uint160(1) << 10) | (uint160(1) << 7) | (uint160(1) << 6) | (uint160(1) << 2);
        bytes memory initCode = abi.encodePacked(
            type(GoldgardHook).creationCode,
            abi.encode(address(this), IPoolManager(address(manager)), oracle, safety, hedge, rewards)
        );
        (bytes32 salt,) = HookMiner.findSalt(address(this), keccak256(initCode), requiredFlags, 100_000);
        hook =
            new GoldgardHook{salt: salt}(address(this), IPoolManager(address(manager)), oracle, safety, hedge, rewards);

        oracle.setHook(address(hook));
        safety.setHook(address(hook));
        safety.setClaimsView(IGoldgardClaimsView(address(hook)));
        hedge.setHook(address(hook));
        rewards.setHook(address(hook));

        agg = new MockAggregatorV3(8, 1e8);
        OracleAdapter.PoolOracleConfig memory oCfg = OracleAdapter.PoolOracleConfig({
            aggregator: IChainlinkAggregatorV3(address(agg)),
            maxStaleSeconds: 3600,
            aggregatorDecimals: 8,
            token0Decimals: 18,
            token1Decimals: 18
        });

        key = PoolKey({
            currency0: Currency.wrap(address(token0)),
            currency1: Currency.wrap(address(token1)),
            fee: LPFeeLibrary.DYNAMIC_FEE_FLAG,
            tickSpacing: 60,
            hooks: IHooks(address(hook))
        });
        oracle.setPoolOracleConfig(key, oCfg);

        GoldgardHook.PoolConfig memory cfg;
        cfg.baseLpFee = 500;
        cfg.maxLpFee = 5000;
        cfg.feeSlopeBps = 1;
        cfg.deviationBps = 0;
        cfg.circuitBreakerBps = 10_000;
        cfg.rebalanceBps = 5000;
        cfg.twapWindowSeconds = 60;
        cfg.circuitBreakerCooldownSeconds = 1800;
        hook.setPoolConfig(key, cfg);

        manager.initialize(key, TickMath.getSqrtPriceAtTick(0));

        token0.approve(address(liqRouter), type(uint256).max);
        token1.approve(address(liqRouter), type(uint256).max);
        token0.approve(address(swapRouter), type(uint256).max);
        token1.approve(address(swapRouter), type(uint256).max);

        token0.mint(address(hedge), 500_000e18);
        token1.mint(address(hedge), 500_000e18);

        int24 lower = TickMath.minUsableTick(key.tickSpacing);
        int24 upper = TickMath.maxUsableTick(key.tickSpacing);

        ModifyLiquidityParams memory p =
            ModifyLiquidityParams({tickLower: lower, tickUpper: upper, liquidityDelta: 10_000e18, salt: bytes32(0)});
        liqRouter.modifyLiquidity(key, p, abi.encodePacked(address(this)));

        handler = new GoldgardHandler(key, swapRouter, safety, token0, token1);
        targetContract(address(handler));

        safetyAssetsAtStart = safety.totalAssets();
    }

    function invariant_safetyAssetsMonotonicUnderSwaps() public view {
        require(safety.totalAssets() >= safetyAssetsAtStart);
    }

    function invariant_hookDoesNotAccumulateTokenBalances() public view {
        require(token0.balanceOf(address(hook)) == 0);
        require(token1.balanceOf(address(hook)) == 0);
    }
}
