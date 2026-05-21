// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {IERC20} from "openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";

import {PoolManager} from "v4-core/PoolManager.sol";
import {IPoolManager} from "v4-core/interfaces/IPoolManager.sol";
import {PoolKey} from "v4-core/types/PoolKey.sol";
import {PoolId} from "v4-core/types/PoolId.sol";
import {Currency} from "v4-core/types/Currency.sol";
import {IHooks} from "v4-core/interfaces/IHooks.sol";
import {
    ModifyLiquidityParams,
    SwapParams
} from "v4-core/types/PoolOperation.sol";
import {TickMath} from "v4-core/libraries/TickMath.sol";
import {LPFeeLibrary} from "v4-core/libraries/LPFeeLibrary.sol";

import {
    PoolModifyLiquidityTestNoChecks
} from "v4-core/test/PoolModifyLiquidityTestNoChecks.sol";
import {SwapRouterNoChecks} from "v4-core/test/SwapRouterNoChecks.sol";

import {MockERC20} from "solmate/src/test/utils/mocks/MockERC20.sol";

import {GoldgardHook} from "../src/GoldgardHook.sol";
import {OracleAdapter} from "../src/OracleAdapter.sol";
import {SafetyModule} from "../src/SafetyModule.sol";
import {IGoldgardClaimsView} from "../src/SafetyModule.sol";
import {HedgeReserve} from "../src/HedgeReserve.sol";
import {RewardDistributor} from "../src/RewardDistributor.sol";
import {GoldgardCallbackReceiver} from "../src/GoldgardCallbackReceiver.sol";
import {
    IChainlinkAggregatorV3
} from "../src/interfaces/IChainlinkAggregatorV3.sol";

import {MockAggregatorV3} from "./mocks/MockAggregatorV3.sol";
import {HookMiner} from "./utils/HookMiner.sol";

contract GoldgardHookTest is Test {
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
    GoldgardCallbackReceiver internal receiver;
    address internal reactiveCallbackProxy = address(0xCA11);

    PoolKey internal key;

    function setUp() public {
        manager = new PoolManager(address(this));
        liqRouter = new PoolModifyLiquidityTestNoChecks(manager);
        swapRouter = new SwapRouterNoChecks(manager);

        token0 = new MockERC20("LST", "LST", 18);
        token1 = new MockERC20("USDC", "USDC", 18);

        token0.mint(address(this), 1_000_000e18);
        token1.mint(address(this), 1_000_000e18);

        oracle = new OracleAdapter(address(this));
        safety = new SafetyModule(
            address(this),
            IERC20(address(token1)),
            "Goldgard Safety Vault",
            "gSAFE"
        );
        hedge = new HedgeReserve(address(this), IPoolManager(address(manager)), oracle);
        rewards = new RewardDistributor(address(this));

        uint160 requiredFlags = (uint160(1) << 10) |
            (uint160(1) << 8) |
            (uint160(1) << 7) |
            (uint160(1) << 6) |
            (uint160(1) << 2);

        bytes memory initCode = abi.encodePacked(
            type(GoldgardHook).creationCode,
            abi.encode(
                address(this),
                IPoolManager(address(manager)),
                oracle,
                safety,
                hedge,
                rewards
            )
        );

        (bytes32 salt, ) = HookMiner.findSalt(
            address(this),
            keccak256(initCode),
            requiredFlags,
            100_000
        );
        hook = new GoldgardHook{salt: salt}(
            address(this),
            IPoolManager(address(manager)),
            oracle,
            safety,
            hedge,
            rewards
        );

        oracle.setHook(address(hook));
        safety.setHook(address(hook));
        safety.setClaimsView(IGoldgardClaimsView(address(hook)));
        hedge.setHook(address(hook));
        rewards.setHook(address(hook));

        receiver = new GoldgardCallbackReceiver(
            address(this),
            reactiveCallbackProxy,
            address(hook),
            address(safety)
        );
        hook.setAuthorizedCaller(address(receiver));
        safety.setAuthorizedCaller(address(receiver));

        agg = new MockAggregatorV3(8, 1e8);
        OracleAdapter.PoolOracleConfig memory oCfg = OracleAdapter
            .PoolOracleConfig({
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
        cfg.deviationBps = 50;
        cfg.circuitBreakerBps = 200;
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

        ModifyLiquidityParams memory p = ModifyLiquidityParams({
            tickLower: lower,
            tickUpper: upper,
            liquidityDelta: 10_000e18,
            salt: bytes32(0)
        });

        liqRouter.modifyLiquidity(key, p, abi.encodePacked(address(this)));
    }

    function testPremiumAccruesToSafetyModule() public {
        uint256 beforeAssets = safety.totalAssets();

        SwapParams memory p = SwapParams({
            zeroForOne: true,
            amountSpecified: -1_000e18,
            sqrtPriceLimitX96: TickMath.MIN_SQRT_PRICE + 1
        });

        swapRouter.swap(key, p);

        uint256 afterAssets = safety.totalAssets();
        assertGt(afterAssets, beforeAssets);
    }

    function testPremiumAccruesWhenFeeCurrencyIsToken0() public {
        uint256 beforeAssets = safety.totalAssets();

        SwapParams memory p = SwapParams({
            zeroForOne: false,
            amountSpecified: -1_000e18,
            sqrtPriceLimitX96: TickMath.MAX_SQRT_PRICE - 1
        });

        swapRouter.swap(key, p);

        uint256 afterAssets = safety.totalAssets();
        assertGt(afterAssets, beforeAssets);
    }

    function testCircuitBreakerTripsWhenOracleTooFar() public {
        agg.setAnswer(2e8);

        SwapParams memory p = SwapParams({
            zeroForOne: true,
            amountSpecified: -1e18,
            sqrtPriceLimitX96: TickMath.MIN_SQRT_PRICE + 1
        });

        vm.expectRevert();
        swapRouter.swap(key, p);
    }

    function testEligibilityUsesLiveTimeAccrual() public {
        vm.warp(block.timestamp + 3 days);
        bool ok = hook.isEligible(address(this), key.toId());
        assertTrue(ok);
    }

    function testRemoveLiquidityDeletesPositionAndDisqualifies() public {
        int24 lower = TickMath.minUsableTick(key.tickSpacing);
        int24 upper = TickMath.maxUsableTick(key.tickSpacing);
        bytes32 positionKey = keccak256(
            abi.encode(key.toId(), address(this), lower, upper, bytes32(0))
        );
        (uint128 liquidityBefore, , , , , , , ) = hook.positions(positionKey);
        assertGt(liquidityBefore, 0);

        ModifyLiquidityParams memory rm = ModifyLiquidityParams({
            tickLower: lower,
            tickUpper: upper,
            liquidityDelta: -10_000e18,
            salt: bytes32(0)
        });

        liqRouter.modifyLiquidity(key, rm, abi.encodePacked(address(this)));

        (uint128 liquidityAfter, , , , , , , ) = hook.positions(positionKey);
        assertEq(liquidityAfter, 0);
        assertFalse(hook.isEligible(address(this), key.toId()));
    }

    function testRebalanceSkipsPremiumAccountingAndClearsPending() public {
        SwapParams memory p = SwapParams({
            zeroForOne: true,
            amountSpecified: -1_000e18,
            sqrtPriceLimitX96: TickMath.MIN_SQRT_PRICE + 1
        });
        swapRouter.swap(key, p);

        PoolId poolId = key.toId();
        uint256 pending0 = hook.pendingToken0In(poolId);
        uint256 pending1 = hook.pendingToken1In(poolId);
        require(pending0 > 0 || pending1 > 0);

        uint256 safetyBefore = safety.totalAssets();
        if (pending0 > 0) {
            hook.rebalance(key, true, pending0);
            assertEq(hook.pendingToken0In(poolId), 0);
        } else {
            hook.rebalance(key, false, pending1);
            assertEq(hook.pendingToken1In(poolId), 0);
        }
        uint256 safetyAfter = safety.totalAssets();
        assertEq(safetyAfter, safetyBefore);
        assertEq(token0.balanceOf(address(hook)), 0);
        assertEq(token1.balanceOf(address(hook)), 0);
    }

    function testRebalanceSupportsPartialConsumption() public {
        SwapParams memory p = SwapParams({
            zeroForOne: true,
            amountSpecified: -1_000e18,
            sqrtPriceLimitX96: TickMath.MIN_SQRT_PRICE + 1
        });
        swapRouter.swap(key, p);

        PoolId poolId = key.toId();
        uint256 pending0 = hook.pendingToken0In(poolId);
        uint256 pending1 = hook.pendingToken1In(poolId);
        require(pending0 > 1 || pending1 > 1);

        uint256 safetyBefore = safety.totalAssets();
        if (pending0 > 1) {
            uint256 half = pending0 / 2;
            hook.rebalance(key, true, half);
            assertEq(safety.totalAssets(), safetyBefore);
            assertEq(hook.pendingToken0In(poolId), pending0 - half);
        } else {
            uint256 half = pending1 / 2;
            hook.rebalance(key, false, half);
            assertEq(safety.totalAssets(), safetyBefore);
            assertEq(hook.pendingToken1In(poolId), pending1 - half);
        }
    }

    function testUnlockCallbackOnlyPoolManager() public {
        vm.expectRevert();
        hook.unlockCallback(new bytes(0));
    }

    function testPreviewClaimRevertsWhenChainlinkStale() public {
        vm.warp(block.timestamp + 4000);
        vm.expectRevert(OracleAdapter.OracleUnavailable.selector);
        hook.previewClaim(address(this), key.toId());
    }

    function testAuthorizedCallerSet() public {
        hook.setAuthorizedCaller(address(0xBEEF));
        assertEq(hook.authorizedCaller(), address(0xBEEF));
    }

    function testHookOnlyAuthorizedRejectsDirectCaller() public {
        vm.prank(address(0xBEEF));
        vm.expectRevert(GoldgardHook.OnlyAuthorized.selector);
        hook.setAlertLevel(1);
    }

    function testRaiseAlertLevelOnlyProxyAndPrewarmsFee() public {
        vm.expectRevert(GoldgardCallbackReceiver.OnlyReactiveCallbackProxy.selector);
        receiver.handleAlertLevel(1);

        vm.prank(reactiveCallbackProxy);
        receiver.handleAlertLevel(1);

        (uint8 lvl, uint64 until) = hook.getReactiveAlert();
        assertEq(lvl, 1);
        assertGt(until, uint64(block.timestamp));

        SwapParams memory p = SwapParams({
            zeroForOne: true,
            amountSpecified: -1e18,
            sqrtPriceLimitX96: TickMath.MIN_SQRT_PRICE + 1
        });

        vm.prank(address(manager));
        (, , uint24 overrideFee) = hook.beforeSwap(address(0), key, p, new bytes(0));
        assertTrue(overrideFee.isOverride());
        uint24 rawFee = overrideFee.removeOverrideFlag();
        assertEq(rawFee, 800);

        vm.warp(uint256(until) + 1);
        vm.prank(address(manager));
        (, , uint24 overrideFee2) = hook.beforeSwap(address(0), key, p, new bytes(0));
        assertEq(overrideFee2.removeOverrideFlag(), 500);
    }

    function testReceiverRejectsWhenHookNotConfigured() public {
        GoldgardCallbackReceiver r = new GoldgardCallbackReceiver(
            address(this),
            reactiveCallbackProxy,
            address(0),
            address(0)
        );
        vm.prank(reactiveCallbackProxy);
        vm.expectRevert(GoldgardCallbackReceiver.BadConfig.selector);
        r.handleAlertLevel(1);
    }

    function testReceiverRejectsWhenSafetyNotConfigured() public {
        GoldgardCallbackReceiver r = new GoldgardCallbackReceiver(
            address(this),
            reactiveCallbackProxy,
            address(hook),
            address(0)
        );
        vm.prank(reactiveCallbackProxy);
        vm.expectRevert(GoldgardCallbackReceiver.BadConfig.selector);
        r.handleEpochCheckpoint();
    }

    function testReceiverTightenThresholdMaxUnsetAllowsAnyAboveMin() public {
        receiver.setBounds(3, 10, 0, 100);
        vm.prank(reactiveCallbackProxy);
        receiver.handleTightenThreshold(11);
        assertEq(hook.minRebalanceAmountIn(), 11);
    }

    function testReceiverSetTargetsUpdatesStorage() public {
        receiver.setTargets(address(0xBEEF), address(0xFEED));
        assertEq(receiver.hook(), address(0xBEEF));
        assertEq(receiver.safetyModule(), address(0xFEED));
    }

    function testReceiverBoundsEnforced() public {
        receiver.setBounds(1, 10, 20, 50);

        vm.prank(reactiveCallbackProxy);
        vm.expectRevert(GoldgardCallbackReceiver.BadConfig.selector);
        receiver.handleAlertLevel(2);

        vm.prank(reactiveCallbackProxy);
        vm.expectRevert(GoldgardCallbackReceiver.BadConfig.selector);
        receiver.handleTightenThreshold(9);

        vm.prank(reactiveCallbackProxy);
        vm.expectRevert(GoldgardCallbackReceiver.BadConfig.selector);
        receiver.handleTightenThreshold(21);

        vm.prank(reactiveCallbackProxy);
        vm.expectRevert(GoldgardCallbackReceiver.BadConfig.selector);
        receiver.handleAdjustPremiumRate(51);
    }

    function testRaiseAlertLevelLevel2AppliesBiggerBump() public {
        vm.prank(reactiveCallbackProxy);
        receiver.handleAlertLevel(2);

        SwapParams memory p = SwapParams({
            zeroForOne: true,
            amountSpecified: -1e18,
            sqrtPriceLimitX96: TickMath.MIN_SQRT_PRICE + 1
        });

        vm.prank(address(manager));
        (, , uint24 overrideFee) = hook.beforeSwap(address(0), key, p, new bytes(0));
        assertEq(overrideFee.removeOverrideFlag(), 1000);
    }

    function testReactiveAlertDoesNotOverrideWhenDeviationAlreadyHigher() public {
        GoldgardHook.PoolConfig memory cfg;
        cfg.baseLpFee = 500;
        cfg.maxLpFee = 10_000;
        cfg.feeSlopeBps = 1;
        cfg.deviationBps = 50;
        cfg.circuitBreakerBps = 10_000;
        cfg.rebalanceBps = 0;
        cfg.twapWindowSeconds = 60;
        cfg.circuitBreakerCooldownSeconds = 0;
        hook.setPoolConfig(key, cfg);

        agg.setAnswer(300e6);

        SwapParams memory p = SwapParams({
            zeroForOne: true,
            amountSpecified: -1e18,
            sqrtPriceLimitX96: TickMath.MIN_SQRT_PRICE + 1
        });

        vm.prank(address(manager));
        (, , uint24 noAlertFee) = hook.beforeSwap(address(0), key, p, new bytes(0));

        vm.prank(reactiveCallbackProxy);
        receiver.handleAlertLevel(2);

        vm.prank(address(manager));
        (, , uint24 alertFee) = hook.beforeSwap(address(0), key, p, new bytes(0));

        assertEq(alertFee, noAlertFee);
    }

    function testAdjustPremiumRateAffectsPremiumDivertedEvent() public {
        vm.prank(reactiveCallbackProxy);
        receiver.handleAdjustPremiumRate(10);

        vm.recordLogs();
        SwapParams memory p = SwapParams({
            zeroForOne: true,
            amountSpecified: -1_000e18,
            sqrtPriceLimitX96: TickMath.MIN_SQRT_PRICE + 1
        });
        swapRouter.swap(key, p);

        Vm.Log[] memory logs = vm.getRecordedLogs();
        bytes32 sig = keccak256(
            "PremiumDiverted(bytes32,address,address,uint256,uint256,uint16)"
        );
        bool found;
        for (uint256 i = 0; i < logs.length; i++) {
            if (logs[i].topics.length > 0 && logs[i].topics[0] == sig) {
                (address feeCurrency, uint256 feeAmount, uint256 usdcDeposited, uint16 premiumBps_) = abi.decode(
                    logs[i].data,
                    (address, uint256, uint256, uint16)
                );
                feeCurrency;
                feeAmount;
                usdcDeposited;
                assertEq(premiumBps_, 10);
                found = true;
                break;
            }
        }
        assertTrue(found);
    }

    function testAdjustPremiumRateRejectsOverMax() public {
        vm.prank(reactiveCallbackProxy);
        vm.expectRevert(GoldgardCallbackReceiver.BadConfig.selector);
        receiver.handleAdjustPremiumRate(101);
    }

    function testTightenRebalanceThresholdSkipsSmallPending() public {
        SwapParams memory p = SwapParams({
            zeroForOne: true,
            amountSpecified: -1_000e18,
            sqrtPriceLimitX96: TickMath.MIN_SQRT_PRICE + 1
        });
        swapRouter.swap(key, p);

        PoolId poolId = key.toId();
        uint256 pending0 = hook.pendingToken0In(poolId);
        uint256 pending1 = hook.pendingToken1In(poolId);
        require(pending0 > 0 || pending1 > 0);

        if (pending0 > 0) {
            vm.prank(reactiveCallbackProxy);
            receiver.handleTightenThreshold(pending0 + 1);

            uint256 out = hook.rebalance(key, true, pending0);
            assertEq(out, 0);
            assertEq(hook.pendingToken0In(poolId), pending0);
        } else {
            vm.prank(reactiveCallbackProxy);
            receiver.handleTightenThreshold(pending1 + 1);

            uint256 out = hook.rebalance(key, false, pending1);
            assertEq(out, 0);
            assertEq(hook.pendingToken1In(poolId), pending1);
        }
    }

    function testBeforeSwapRevertsWhenCircuitBreakerActive() public {
        GoldgardHook.PoolConfig memory cfg;
        cfg.baseLpFee = 500;
        cfg.maxLpFee = 5000;
        cfg.feeSlopeBps = 1;
        cfg.deviationBps = 50;
        cfg.circuitBreakerBps = 200;
        cfg.rebalanceBps = 5000;
        cfg.twapWindowSeconds = 60;
        cfg.circuitBreakerCooldownSeconds = 1800;
        cfg.pausedUntil = uint64(block.timestamp + 100);
        hook.setPoolConfig(key, cfg);

        SwapParams memory p = SwapParams({
            zeroForOne: true,
            amountSpecified: -1e18,
            sqrtPriceLimitX96: TickMath.MIN_SQRT_PRICE + 1
        });
        vm.prank(address(manager));
        vm.expectRevert(GoldgardHook.CircuitBreakerActive.selector);
        hook.beforeSwap(address(0), key, p, new bytes(0));
    }

    function testBeforeSwapClampsFeeToMaxLpFee() public {
        agg.setAnswer(121e6);

        GoldgardHook.PoolConfig memory cfg;
        cfg.baseLpFee = 500;
        cfg.maxLpFee = 600;
        cfg.feeSlopeBps = 10;
        cfg.deviationBps = 0;
        cfg.circuitBreakerBps = 10_000;
        cfg.rebalanceBps = 0;
        cfg.twapWindowSeconds = 60;
        cfg.circuitBreakerCooldownSeconds = 0;
        hook.setPoolConfig(key, cfg);

        SwapParams memory p = SwapParams({
            zeroForOne: true,
            amountSpecified: -1e18,
            sqrtPriceLimitX96: TickMath.MIN_SQRT_PRICE + 1
        });
        vm.prank(address(manager));
        (, , uint24 overrideFee) = hook.beforeSwap(address(0), key, p, new bytes(0));
        assertEq(overrideFee.removeOverrideFlag(), 600);
    }

    function testRebalanceReturnsZeroWhenNoPending() public {
        uint256 out = hook.rebalance(key, true, 0);
        assertEq(out, 0);
    }

    function testSwapWithTooSmallAmountProducesNoPremium() public {
        uint256 beforeAssets = safety.totalAssets();
        SwapParams memory p = SwapParams({
            zeroForOne: true,
            amountSpecified: -int256(1),
            sqrtPriceLimitX96: TickMath.MIN_SQRT_PRICE + 1
        });
        swapRouter.swap(key, p);
        assertEq(safety.totalAssets(), beforeAssets);
    }

    function testBeforeSwapFallsBackToTwapWhenNoChainlink() public {
        OracleAdapter.PoolOracleConfig memory oCfg = OracleAdapter.PoolOracleConfig({
            aggregator: IChainlinkAggregatorV3(address(0)),
            maxStaleSeconds: 3600,
            aggregatorDecimals: 8,
            token0Decimals: 18,
            token1Decimals: 18
        });
        oracle.setPoolOracleConfig(key, oCfg);

        SwapParams memory p = SwapParams({
            zeroForOne: true,
            amountSpecified: -1e18,
            sqrtPriceLimitX96: TickMath.MIN_SQRT_PRICE + 1
        });
        vm.prank(address(manager));
        (, , uint24 overrideFee) = hook.beforeSwap(address(0), key, p, new bytes(0));
        assertTrue(overrideFee.isOverride());
    }

    function testAfterAddLiquidityResolvesOwnerToSenderWhenNoHookData() public {
        int24 lower = TickMath.minUsableTick(key.tickSpacing);
        int24 upper = TickMath.maxUsableTick(key.tickSpacing);

        ModifyLiquidityParams memory p = ModifyLiquidityParams({
            tickLower: lower,
            tickUpper: upper,
            liquidityDelta: 1_000e18,
            salt: bytes32(uint256(1))
        });
        liqRouter.modifyLiquidity(key, p, new bytes(0));

        bytes32 positionKey = keccak256(
            abi.encode(key.toId(), address(liqRouter), lower, upper, bytes32(uint256(1)))
        );
        (uint128 liq, , , , , , , ) = hook.positions(positionKey);
        assertGt(liq, 0);
    }

    function testPreviewClaimReturnsZeroForAccountWithoutPosition() public view {
        uint256 p = hook.previewClaim(address(0xB0B), key.toId());
        assertEq(p, 0);
    }

    function testCoverageCapLimitsPayout() public {
        hook.setCoverageCapBps(1);
        agg.setAnswer(2e8);

        PoolId poolId = key.toId();
        bytes32 positionKey = keccak256(
            abi.encode(
                poolId,
                address(this),
                TickMath.minUsableTick(key.tickSpacing),
                TickMath.maxUsableTick(key.tickSpacing),
                bytes32(0)
            )
        );
        (, , , , uint256 principalToken1, , , ) = hook.positions(positionKey);

        uint256 payout = hook.previewClaim(address(this), poolId);
        uint256 expected = principalToken1 / 10_000;
        uint256 available = IERC20(address(safety.asset())).balanceOf(address(safety));
        if (expected > available) expected = available;
        assertEq(payout, expected);
        require(payout > 0);
    }

    function testRebalanceExecutesBothDirections() public {
        SwapParams memory p = SwapParams({
            zeroForOne: false,
            amountSpecified: -1_000e18,
            sqrtPriceLimitX96: TickMath.MAX_SQRT_PRICE - 1
        });
        swapRouter.swap(key, p);

        PoolId poolId = key.toId();
        uint256 pending1 = hook.pendingToken1In(poolId);
        if (pending1 == 0) return;

        uint256 out = hook.rebalance(key, false, pending1);
        assertGt(out, 0);
    }

    function testRebalanceReturnsZeroWhenRebalanceDisabled() public {
        GoldgardHook.PoolConfig memory cfg;
        cfg.baseLpFee = 500;
        cfg.maxLpFee = 5000;
        cfg.feeSlopeBps = 1;
        cfg.deviationBps = 50;
        cfg.circuitBreakerBps = 10_000;
        cfg.rebalanceBps = 0;
        cfg.twapWindowSeconds = 60;
        cfg.circuitBreakerCooldownSeconds = 0;
        hook.setPoolConfig(key, cfg);

        uint256 out = hook.rebalance(key, true, 0);
        assertEq(out, 0);
    }
}
