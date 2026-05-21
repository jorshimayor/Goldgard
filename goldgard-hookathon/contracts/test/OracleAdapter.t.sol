// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";

import {PoolManager} from "v4-core/PoolManager.sol";
import {IPoolManager} from "v4-core/interfaces/IPoolManager.sol";
import {PoolKey} from "v4-core/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "v4-core/types/PoolId.sol";
import {Currency} from "v4-core/types/Currency.sol";
import {IHooks} from "v4-core/interfaces/IHooks.sol";
import {ModifyLiquidityParams, SwapParams} from "v4-core/types/PoolOperation.sol";
import {TickMath} from "v4-core/libraries/TickMath.sol";

import {PoolModifyLiquidityTestNoChecks} from "v4-core/test/PoolModifyLiquidityTestNoChecks.sol";
import {SwapRouterNoChecks} from "v4-core/test/SwapRouterNoChecks.sol";

import {MockERC20} from "solmate/src/test/utils/mocks/MockERC20.sol";

import {OracleAdapter} from "../src/OracleAdapter.sol";
import {IChainlinkAggregatorV3} from "../src/interfaces/IChainlinkAggregatorV3.sol";
import {MockAggregatorV3} from "./mocks/MockAggregatorV3.sol";

contract OracleAdapterTest is Test {
    using PoolIdLibrary for PoolKey;

    event OraclePriceUpdated(
        uint256 twap,
        uint256 external_,
        uint256 deviationBps,
        uint256 timestamp
    );

    PoolManager internal manager;
    PoolModifyLiquidityTestNoChecks internal liqRouter;
    SwapRouterNoChecks internal swapRouter;

    MockERC20 internal token0;
    MockERC20 internal token1;

    OracleAdapter internal oracle;
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

        oracle = new OracleAdapter(address(this));
        oracle.setHook(address(this));

        agg = new MockAggregatorV3(8, 1e8);

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
    }

    function testUpdateFromPoolIgnoresSameTimestamp() public {
        oracle.updateFromPool(IPoolManager(address(manager)), key);
        PoolId poolId = key.toId();
        (, uint160 beforeSqrt, , , ) = oracle.poolState(poolId);

        SwapParams memory p = SwapParams({
            zeroForOne: true,
            amountSpecified: -int256(1e18),
            sqrtPriceLimitX96: TickMath.MIN_SQRT_PRICE + 1
        });
        swapRouter.swap(key, p);

        oracle.updateFromPool(IPoolManager(address(manager)), key);
        (, uint160 afterSqrt, , , ) = oracle.poolState(poolId);

        require(beforeSqrt == afterSqrt);
    }

    function testGetPrice1e18StrictRevertsWhenStale() public {
        vm.warp(block.timestamp + 4000);
        vm.expectRevert(OracleAdapter.OracleUnavailable.selector);
        oracle.getPrice1e18Strict(key);
    }

    function testSetPoolOracleConfigRejectsExtremeDecimals() public {
        OracleAdapter.PoolOracleConfig memory badCfg = OracleAdapter.PoolOracleConfig({
            aggregator: IChainlinkAggregatorV3(address(agg)),
            maxStaleSeconds: 3600,
            aggregatorDecimals: 8,
            token0Decimals: 31,
            token1Decimals: 18
        });
        vm.expectRevert(OracleAdapter.BadConfig.selector);
        oracle.setPoolOracleConfig(key, badCfg);
    }

    function testChainlinkDecimalScalingBranchesReturnPrice() public {
        OracleAdapter.PoolOracleConfig memory cfg = OracleAdapter.PoolOracleConfig({
            aggregator: IChainlinkAggregatorV3(address(agg)),
            maxStaleSeconds: 3600,
            aggregatorDecimals: 20,
            token0Decimals: 6,
            token1Decimals: 24
        });
        oracle.setPoolOracleConfig(key, cfg);

        (uint160 sqrtPriceX96, bool ok) = oracle.getChainlinkSqrtPriceX96(key);
        require(ok);
        require(sqrtPriceX96 != 0);
    }

    function testGetPriceFallsBackToTwapWhenNoChainlink() public {
        OracleAdapter.PoolOracleConfig memory cfg = OracleAdapter.PoolOracleConfig({
            aggregator: IChainlinkAggregatorV3(address(0)),
            maxStaleSeconds: 3600,
            aggregatorDecimals: 8,
            token0Decimals: 18,
            token1Decimals: 18
        });
        oracle.setPoolOracleConfig(key, cfg);

        oracle.updateFromPool(IPoolManager(address(manager)), key);
        vm.warp(block.timestamp + 20 minutes);
        oracle.updateFromPool(IPoolManager(address(manager)), key);

        uint256 p = oracle.getPrice1e18(key, 600);
        require(p != 0);
    }

    function testTwapReturnsLastPriceIfNoTimeElapsed() public {
        oracle.updateFromPool(IPoolManager(address(manager)), key);
        uint160 twap = oracle.getTwapSqrtPriceX96(key, 600);
        require(twap != 0);
    }

    function testTwapReturnsNonZeroWithSufficientHistory() public {
        oracle.updateFromPool(IPoolManager(address(manager)), key);

        vm.warp(block.timestamp + 20 minutes);
        SwapParams memory p = SwapParams({
            zeroForOne: true,
            amountSpecified: -int256(1e18),
            sqrtPriceLimitX96: TickMath.MIN_SQRT_PRICE + 1
        });
        swapRouter.swap(key, p);

        oracle.updateFromPool(IPoolManager(address(manager)), key);

        uint160 twap = oracle.getTwapSqrtPriceX96(key, 1);
        require(twap != 0);
    }

    function testTwapRingBufferSearchPath() public {
        oracle.updateFromPool(IPoolManager(address(manager)), key);

        for (uint256 i = 0; i < 40; i++) {
            vm.warp(block.timestamp + 10 minutes);
            oracle.updateFromPool(IPoolManager(address(manager)), key);
        }

        uint160 twap = oracle.getTwapSqrtPriceX96(key, 3 hours);
        require(twap != 0);
    }

    function testUpdateFromPoolEmitsOraclePriceUpdated() public {
        oracle.updateFromPool(IPoolManager(address(manager)), key);

        vm.warp(block.timestamp + 11 minutes);
        vm.recordLogs();
        oracle.updateFromPool(IPoolManager(address(manager)), key);
        Vm.Log[] memory logs = vm.getRecordedLogs();

        bytes32 sig = keccak256(
            "OraclePriceUpdated(uint256,uint256,uint256,uint256)"
        );
        bool found;
        for (uint256 i = 0; i < logs.length; i++) {
            if (logs[i].topics.length > 0 && logs[i].topics[0] == sig) {
                (uint256 twap, uint256 external_, uint256 deviationBps, uint256 ts) = abi.decode(
                    logs[i].data,
                    (uint256, uint256, uint256, uint256)
                );
                require(twap != 0);
                require(external_ == 1e18);
                deviationBps;
                require(ts == block.timestamp);
                found = true;
                break;
            }
        }
        assertTrue(found);
    }

    function testGetChainlinkSqrtPriceReturnsFalseWhenAnswerNonPositive() public {
        agg.setAnswer(0);
        (, bool ok) = oracle.getChainlinkSqrtPriceX96(key);
        assertFalse(ok);
    }

    function testGetChainlinkSqrtPriceReturnsFalseWhenUpdatedAtZero() public {
        vm.store(address(agg), bytes32(uint256(1)), bytes32(uint256(0)));
        (, bool ok) = oracle.getChainlinkSqrtPriceX96(key);
        assertFalse(ok);
    }

    function testGetChainlinkSqrtPriceReturnsFalseWhenUpdatedAtInFuture() public {
        vm.store(
            address(agg),
            bytes32(uint256(1)),
            bytes32(block.timestamp + 1)
        );
        (, bool ok) = oracle.getChainlinkSqrtPriceX96(key);
        assertFalse(ok);
    }

    function testGetTwapReturnsZeroWhenNeverUpdated() public {
        OracleAdapter fresh = new OracleAdapter(address(this));
        uint160 twap = fresh.getTwapSqrtPriceX96(key, 600);
        assertEq(twap, 0);
    }

    function testGetPriceReturnsZeroWhenNoChainlinkAndNoTwap() public {
        OracleAdapter fresh = new OracleAdapter(address(this));
        OracleAdapter.PoolOracleConfig memory cfg = OracleAdapter.PoolOracleConfig({
            aggregator: IChainlinkAggregatorV3(address(0)),
            maxStaleSeconds: 3600,
            aggregatorDecimals: 8,
            token0Decimals: 18,
            token1Decimals: 18
        });
        fresh.setPoolOracleConfig(key, cfg);
        uint256 p = fresh.getPrice1e18(key, 600);
        assertEq(p, 0);
    }

    function testSetHookOnlyOwner() public {
        OracleAdapter fresh = new OracleAdapter(address(this));
        vm.prank(address(0xBEEF));
        vm.expectRevert();
        fresh.setHook(address(1));
    }

    function testUpdateFromPoolOnlyHook() public {
        OracleAdapter fresh = new OracleAdapter(address(this));
        fresh.setHook(address(0xBEEF));
        vm.expectRevert(OracleAdapter.OnlyHook.selector);
        fresh.updateFromPool(IPoolManager(address(manager)), key);
    }

    function testChainlinkScalingBranchesDecimals18Token0Gt18Token1Lt18() public {
        MockAggregatorV3 agg18 = new MockAggregatorV3(18, 1e18);
        OracleAdapter.PoolOracleConfig memory cfg = OracleAdapter.PoolOracleConfig({
            aggregator: IChainlinkAggregatorV3(address(agg18)),
            maxStaleSeconds: 3600,
            aggregatorDecimals: 18,
            token0Decimals: 24,
            token1Decimals: 6
        });
        oracle.setPoolOracleConfig(key, cfg);
        (uint160 sqrtPriceX96, bool ok) = oracle.getChainlinkSqrtPriceX96(key);
        require(ok);
        require(sqrtPriceX96 != 0);
    }

    function testChainlinkScalingBranchAggregatorDecimalsLt18() public {
        OracleAdapter.PoolOracleConfig memory cfg = OracleAdapter.PoolOracleConfig({
            aggregator: IChainlinkAggregatorV3(address(agg)),
            maxStaleSeconds: 3600,
            aggregatorDecimals: 6,
            token0Decimals: 18,
            token1Decimals: 18
        });
        oracle.setPoolOracleConfig(key, cfg);
        (uint160 sqrtPriceX96, bool ok) = oracle.getChainlinkSqrtPriceX96(key);
        require(ok);
        require(sqrtPriceX96 != 0);
    }

    function testGetPriceUsesChainlinkWhenAvailable() public {
        uint256 p = oracle.getPrice1e18(key, 600);
        uint256 strict = oracle.getPrice1e18Strict(key);
        require(p == strict);
    }

    function testTwapSearchHandlesIndexWrapToZero() public {
        oracle.updateFromPool(IPoolManager(address(manager)), key);
        for (uint256 i = 0; i < 31; i++) {
            vm.warp(block.timestamp + 1);
            oracle.updateFromPool(IPoolManager(address(manager)), key);
        }
        uint160 twap = oracle.getTwapSqrtPriceX96(key, 600);
        require(twap != 0);
    }
}
