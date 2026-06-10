// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";

import {PoolManager} from "v4-core/PoolManager.sol";
import {IPoolManager} from "v4-core/interfaces/IPoolManager.sol";
import {PoolKey} from "v4-core/types/PoolKey.sol";
import {Currency} from "v4-core/types/Currency.sol";
import {IHooks} from "v4-core/interfaces/IHooks.sol";
import {ModifyLiquidityParams, SwapParams} from "v4-core/types/PoolOperation.sol";
import {TickMath} from "v4-core/libraries/TickMath.sol";

import {PoolModifyLiquidityTestNoChecks} from "v4-core/test/PoolModifyLiquidityTestNoChecks.sol";
import {SwapRouterNoChecks} from "v4-core/test/SwapRouterNoChecks.sol";

import {MockERC20} from "solmate/src/test/utils/mocks/MockERC20.sol";

import {OracleAdapter} from "../src/OracleAdapter.sol";
import {HedgeReserve} from "../src/HedgeReserve.sol";
import {IChainlinkAggregatorV3} from "../src/interfaces/IChainlinkAggregatorV3.sol";
import {MockAggregatorV3} from "./mocks/MockAggregatorV3.sol";

contract HedgeReserveTest is Test {
    event ReserveBalanceChanged(
        uint256 newBalance,
        int256 delta,
        address indexed triggeredBy
    );

    PoolManager internal manager;
    PoolModifyLiquidityTestNoChecks internal liqRouter;
    SwapRouterNoChecks internal swapRouter;

    MockERC20 internal token0;
    MockERC20 internal token1;

    OracleAdapter internal oracle;
    HedgeReserve internal hedge;
    MockAggregatorV3 internal agg;
    PoolKey internal key;

    function setUp() public {
        manager = new PoolManager(address(this));
        liqRouter = new PoolModifyLiquidityTestNoChecks(manager);
        swapRouter = new SwapRouterNoChecks(manager);

        token0 = new MockERC20("T0", "T0", 18);
        token1 = new MockERC20("T1", "T1", 18);
        token0.mint(address(this), 1_000_000e18);
        token1.mint(address(this), 1_000_000e18);

        agg = new MockAggregatorV3(8, 1e8);
        oracle = new OracleAdapter(address(this));

        key = PoolKey({
            currency0: Currency.wrap(address(token0)),
            currency1: Currency.wrap(address(token1)),
            fee: 3000,
            tickSpacing: 60,
            hooks: IHooks(address(0))
        });

        OracleAdapter.PoolOracleConfig memory oCfg = OracleAdapter.PoolOracleConfig({
            aggregator: IChainlinkAggregatorV3(address(agg)),
            maxStaleSeconds: 3600,
            maxPoolStaleSeconds: 3600,
            aggregatorDecimals: 8,
            token0Decimals: 18,
            token1Decimals: 18
        });
        oracle.setPoolOracleConfig(key, oCfg);

        manager.initialize(key, TickMath.getSqrtPriceAtTick(0));

        token0.approve(address(liqRouter), type(uint256).max);
        token1.approve(address(liqRouter), type(uint256).max);
        token0.approve(address(swapRouter), type(uint256).max);
        token1.approve(address(swapRouter), type(uint256).max);

        int24 lower = TickMath.minUsableTick(key.tickSpacing);
        int24 upper = TickMath.maxUsableTick(key.tickSpacing);
        liqRouter.modifyLiquidity(
            key,
            ModifyLiquidityParams({
                tickLower: lower,
                tickUpper: upper,
                liquidityDelta: 10_000e18,
                salt: bytes32(0)
            }),
            new bytes(0)
        );

        hedge = new HedgeReserve(address(this), IPoolManager(address(manager)), oracle);
        hedge.setHook(address(this));
        token0.mint(address(hedge), 1_000_000e18);
        token1.mint(address(hedge), 1_000_000e18);
    }

    function testConvertToken0ToToken1HappyPath() public {
        token0.mint(address(this), 10e18);
        token0.approve(address(hedge), type(uint256).max);

        uint256 out = hedge.convertToken0ToToken1(key, 1e18, 0);
        require(out == oracle.getPrice1e18Strict(key));
    }

    function testConvertRevertsOnSpotOracleDeviation() public {
        hedge.setMaxSpotOracleDeviationBps(200);
        SwapParams memory p = SwapParams({
            zeroForOne: true,
            amountSpecified: -int256(1000e18),
            sqrtPriceLimitX96: TickMath.MIN_SQRT_PRICE + 1
        });
        swapRouter.swap(key, p);

        token0.mint(address(this), 10e18);
        token0.approve(address(hedge), type(uint256).max);

        vm.expectRevert();
        hedge.convertToken0ToToken1(key, 1e18, 0);
    }

    function testConvertRevertsWhenChainlinkStale() public {
        vm.warp(block.timestamp + 4000);
        token0.mint(address(this), 10e18);
        token0.approve(address(hedge), type(uint256).max);

        vm.expectRevert(OracleAdapter.OracleUnavailable.selector);
        hedge.convertToken0ToToken1(key, 1e18, 0);
    }

    function testConvertToken1ToToken0HappyPath() public {
        token1.mint(address(this), 10e18);
        token1.approve(address(hedge), type(uint256).max);

        uint256 out = hedge.convertToken1ToToken0(key, 1e18, 0);
        require(out != 0);
    }

    function testFundHookOnlyHook() public {
        hedge.setHook(address(0xBEEF));
        vm.expectRevert(HedgeReserve.OnlyHook.selector);
        hedge.fundHook(key.currency0, 1, address(this));
    }

    function testSetMaxSpotOracleDeviationBpsRejectsOverBps() public {
        vm.expectRevert(HedgeReserve.BadConfig.selector);
        hedge.setMaxSpotOracleDeviationBps(0);
    }

    function testFundHookEmitsReserveBalanceChanged() public {
        uint256 beforeBal = token0.balanceOf(address(hedge));
        uint256 amount = 1e18;

        vm.expectEmit(true, false, false, true);
        emit ReserveBalanceChanged(beforeBal - amount, -int256(amount), address(this));

        hedge.fundHook(key.currency0, amount, address(this));
    }

    function testConvertRevertsWhenInsufficientLiquidityToken1Out() public {
        deal(address(token1), address(hedge), 0);
        token0.mint(address(this), 10e18);
        token0.approve(address(hedge), type(uint256).max);

        vm.expectRevert(HedgeReserve.InsufficientLiquidity.selector);
        hedge.convertToken0ToToken1(key, 1e18, 0);
    }

    function testConvertRevertsWhenInsufficientLiquidityToken0Out() public {
        deal(address(token0), address(hedge), 0);
        token1.mint(address(this), 10e18);
        token1.approve(address(hedge), type(uint256).max);

        vm.expectRevert(HedgeReserve.InsufficientLiquidity.selector);
        hedge.convertToken1ToToken0(key, 1e18, 0);
    }

    function testDeprecatedRebalanceFunctionsRevert() public {
        vm.expectRevert(bytes("deprecated"));
        hedge.rebalanceExactToken1Out(
            IPoolManager(address(manager)),
            key,
            0,
            0
        );

        vm.expectRevert(bytes("deprecated"));
        hedge.rebalanceExactToken0Out(
            IPoolManager(address(manager)),
            key,
            0,
            0
        );
    }
}
