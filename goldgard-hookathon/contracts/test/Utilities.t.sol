// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";

import {PoolManager} from "v4-core/PoolManager.sol";
import {IPoolManager} from "v4-core/interfaces/IPoolManager.sol";
import {PoolKey} from "v4-core/types/PoolKey.sol";
import {Currency} from "v4-core/types/Currency.sol";
import {IHooks} from "v4-core/interfaces/IHooks.sol";
import {ModifyLiquidityParams, SwapParams} from "v4-core/types/PoolOperation.sol";
import {BalanceDelta, toBalanceDelta} from "v4-core/types/BalanceDelta.sol";

import {BaseHook} from "../src/libraries/BaseHook.sol";
import {Transient} from "../src/libraries/Transient.sol";
import {RewardDistributor} from "../src/RewardDistributor.sol";
import {DeployDemo} from "../script/DeployDemo.s.sol";
import {SimulatePriceSwing} from "../script/SimulatePriceSwing.s.sol";
import {GoldgardReactiveWatcher} from "../src/GoldgardReactiveWatcher.sol";

contract NoopHook is BaseHook {
    constructor(IPoolManager _manager) BaseHook(_manager) {}

    function onlyManagerPing() external view onlyPoolManager returns (uint256) {
        return 1;
    }
}

contract TransientHarness {
    function roundtripU256(bytes32 slot, uint256 v) external returns (uint256) {
        Transient.tstoreU256(slot, v);
        return Transient.tloadU256(slot);
    }

    function roundtripI256(bytes32 slot, int256 v) external returns (int256) {
        Transient.tstoreI256(slot, v);
        return Transient.tloadI256(slot);
    }
}

contract UtilitiesTest is Test {
    event CallbackRequested(address indexed target, bytes data);
    uint256 internal constant ORACLE_TOPIC_0 =
        uint256(keccak256("OraclePriceUpdated(uint256,uint256,uint256,uint256)"));
    uint256 internal constant PREMIUM_TOPIC_0 =
        uint256(keccak256("PremiumDiverted(bytes32,address,address,uint256,uint256,uint16)"));
    uint256 internal constant CLAIM_PAID_TOPIC_0 =
        uint256(keccak256("ClaimPaid(address,uint256,uint256)"));
    uint256 internal constant RESERVE_BALANCE_TOPIC_0 =
        uint256(keccak256("ReserveBalanceChanged(uint256,int256,address)"));

    function _watcher(address receiver) internal returns (GoldgardReactiveWatcher) {
        return
            new GoldgardReactiveWatcher(
                address(this),
                receiver,
                11155111,
                11155111,
                300000,
                address(0x1001),
                address(0x1002),
                address(0x1003),
                address(0x1004),
                ORACLE_TOPIC_0,
                PREMIUM_TOPIC_0,
                CLAIM_PAID_TOPIC_0,
                RESERVE_BALANCE_TOPIC_0,
                true,
                true,
                true,
                true
            );
    }
    function testBaseHookDefaultMethodsRevert() public {
        PoolManager manager = new PoolManager(address(this));
        NoopHook h = new NoopHook(IPoolManager(address(manager)));
        PoolKey memory key = _dummyKey();
        ModifyLiquidityParams memory mlp = ModifyLiquidityParams({
            tickLower: 0,
            tickUpper: 0,
            liquidityDelta: 0,
            salt: bytes32(0)
        });
        SwapParams memory sp = SwapParams({
            zeroForOne: true,
            amountSpecified: 0,
            sqrtPriceLimitX96: 0
        });
        BalanceDelta d = toBalanceDelta(0, 0);

        vm.expectRevert(BaseHook.HookNotImplemented.selector);
        h.beforeInitialize(address(this), key, 0);

        vm.expectRevert(BaseHook.HookNotImplemented.selector);
        h.afterInitialize(address(this), key, 0, 0);

        vm.expectRevert(BaseHook.HookNotImplemented.selector);
        h.beforeAddLiquidity(address(this), key, mlp, new bytes(0));

        vm.expectRevert(BaseHook.HookNotImplemented.selector);
        h.afterAddLiquidity(address(this), key, mlp, d, d, new bytes(0));

        vm.expectRevert(BaseHook.HookNotImplemented.selector);
        h.beforeRemoveLiquidity(address(this), key, mlp, new bytes(0));

        vm.expectRevert(BaseHook.HookNotImplemented.selector);
        h.afterRemoveLiquidity(address(this), key, mlp, d, d, new bytes(0));

        vm.expectRevert(BaseHook.HookNotImplemented.selector);
        h.beforeSwap(address(this), key, sp, new bytes(0));

        vm.expectRevert(BaseHook.HookNotImplemented.selector);
        h.afterSwap(address(this), key, sp, d, new bytes(0));

        vm.expectRevert(BaseHook.HookNotImplemented.selector);
        h.beforeDonate(address(this), key, 0, 0, new bytes(0));

        vm.expectRevert(BaseHook.HookNotImplemented.selector);
        h.afterDonate(address(this), key, 0, 0, new bytes(0));
    }

    function testBaseHookOnlyPoolManagerModifier() public {
        PoolManager manager = new PoolManager(address(this));
        NoopHook h = new NoopHook(IPoolManager(address(manager)));

        vm.expectRevert(BaseHook.OnlyPoolManager.selector);
        h.onlyManagerPing();
    }

    function testTransientRoundtrip() public {
        TransientHarness h = new TransientHarness();
        bytes32 slot = keccak256("t");
        require(h.roundtripU256(slot, 123) == 123);
        require(h.roundtripI256(slot, -123) == -123);
    }

    function testRewardDistributorOnlyHookAndMints() public {
        RewardDistributor r = new RewardDistributor(address(this));
        r.setHook(address(0xBEEF));

        vm.expectRevert(RewardDistributor.OnlyHook.selector);
        r.mintReward(address(this), 1);

        vm.prank(address(0xBEEF));
        r.mintReward(address(0xA11CE), 123);
        require(r.balanceOf(address(0xA11CE), r.GGARD_ID()) == 123);
    }

    function testScriptsDeployAndSimulateRun() public {
        DeployDemo deploy = new DeployDemo();
        deploy.run();

        SimulatePriceSwing sim = new SimulatePriceSwing();
        sim.run();
    }

    function testReactiveWatcherTriggersCallbackRequest() public {
        address receiver = address(0xCA11);
        GoldgardReactiveWatcher w = _watcher(receiver);

        vm.expectEmit(true, false, false, true);
        emit CallbackRequested(
            receiver,
            abi.encodeWithSignature("handleAlertLevel(address,uint8)", address(0), uint8(2))
        );
        w.onOraclePriceUpdated(0, 0, 300, 100);
    }

    function testReactiveWatcherConstructorRejectsZeroReceiver() public {
        vm.expectRevert(GoldgardReactiveWatcher.BadConfig.selector);
        new GoldgardReactiveWatcher(
            address(this),
            address(0),
            11155111,
            11155111,
            300000,
            address(0x1001),
            address(0x1002),
            address(0x1003),
            address(0x1004),
            ORACLE_TOPIC_0,
            PREMIUM_TOPIC_0,
            CLAIM_PAID_TOPIC_0,
            RESERVE_BALANCE_TOPIC_0,
            true,
            true,
            true,
            true
        );
    }

    function testReactiveWatcherSetterHappyPaths() public {
        GoldgardReactiveWatcher w = _watcher(address(0xCA11));
        w.setThresholds(123, 456);
        w.setAlertLevels(3, 0);
        w.setReservePolicy(100, 200);
        w.setPremiumPolicy(100);
        require(w.earlyWarnBps() == 123);
        require(w.slopeWarnBps() == 456);
        require(w.alertLevelHigh() == 3);
        require(w.alertLevelTrend() == 0);
        require(w.reserveLowThreshold() == 100);
        require(w.tightenThresholdValue() == 200);
        require(w.premiumRateWhenImbalanced() == 100);
    }

    function testReactiveWatcherNoTriggerWhenBelowThresholds() public {
        GoldgardReactiveWatcher w = _watcher(address(0xCA11));
        w.onOraclePriceUpdated(0, 0, 199, 100);
        require(w.lastDeviationBps() == 199);
    }

    function testReactiveWatcherSlopeIgnoredOnDecreaseOrNoTimeElapsed() public {
        GoldgardReactiveWatcher w = _watcher(address(0xCA11));
        w.onOraclePriceUpdated(0, 0, 250, 100);
        w.onOraclePriceUpdated(0, 0, 240, 110);
        require(w.lastSlopeBpsPerSecond() == 0);

        w.onOraclePriceUpdated(0, 0, 260, 110);
        require(w.lastSlopeBpsPerSecond() == 0);
    }

    function testReactiveWatcherTrendTriggerUsesSlope() public {
        GoldgardReactiveWatcher w = _watcher(address(0xCA11));

        w.onOraclePriceUpdated(0, 0, 100, 100);
        vm.expectEmit(true, false, false, true);
        emit CallbackRequested(
            address(0xCA11),
            abi.encodeWithSignature("handleAlertLevel(address,uint8)", address(0), uint8(1))
        );
        w.onOraclePriceUpdated(0, 0, 250, 110);

        require(w.lastSlopeBpsPerSecond() != 0);
    }

    function testReactiveWatcherReserveLowTriggersThresholdTightening() public {
        address receiver = address(0xCA11);
        GoldgardReactiveWatcher w = _watcher(receiver);
        w.setReservePolicy(100, 777);

        vm.expectEmit(true, false, false, true);
        emit CallbackRequested(
            receiver,
            abi.encodeWithSignature(
                "handleTightenThreshold(address,uint256)",
                address(0),
                uint256(777)
            )
        );
        w.onReserveBalanceChanged(99, -1, address(this));
    }

    function testReactiveWatcherClaimPaidTriggersPremiumRateChange() public {
        address receiver = address(0xCA11);
        GoldgardReactiveWatcher w = _watcher(receiver);
        w.setPremiumPolicy(3);

        vm.expectEmit(true, false, false, true);
        emit CallbackRequested(
            receiver,
            abi.encodeWithSignature(
                "handleAdjustPremiumRate(address,uint256)",
                address(0),
                uint256(3)
            )
        );
        w.onClaimPaid(address(this), 1, 0);
    }

    function testReactiveWatcherCronTriggersEpochCheckpoint() public {
        address receiver = address(0xCA11);
        GoldgardReactiveWatcher w = _watcher(receiver);

        vm.expectEmit(true, false, false, true);
        emit CallbackRequested(
            receiver,
            abi.encodeWithSignature("handleEpochCheckpoint(address)", address(0))
        );
        w.onCron();
    }

    function testReactiveWatcherThresholdBounds() public {
        GoldgardReactiveWatcher w = _watcher(address(0xCA11));
        vm.expectRevert(GoldgardReactiveWatcher.BadConfig.selector);
        w.setThresholds(10_001, 0);
    }

    function testReactiveWatcherSlopeWarnBounds() public {
        GoldgardReactiveWatcher w = _watcher(address(0xCA11));
        vm.expectRevert(GoldgardReactiveWatcher.BadConfig.selector);
        w.setThresholds(0, 10_001);
    }

    function testReactiveWatcherAlertLevelBounds() public {
        GoldgardReactiveWatcher w = _watcher(address(0xCA11));
        vm.expectRevert(GoldgardReactiveWatcher.BadConfig.selector);
        w.setAlertLevels(4, 0);
    }

    function testReactiveWatcherAlertLevelTrendBounds() public {
        GoldgardReactiveWatcher w = _watcher(address(0xCA11));
        vm.expectRevert(GoldgardReactiveWatcher.BadConfig.selector);
        w.setAlertLevels(0, 4);
    }

    function testReactiveWatcherPremiumPolicyBoundsAndNoopPaths() public {
        GoldgardReactiveWatcher w = _watcher(address(0xCA11));
        vm.expectRevert(GoldgardReactiveWatcher.BadConfig.selector);
        w.setPremiumPolicy(101);

        w.onClaimPaid(address(this), 0, 0);
        w.onPremiumDiverted(bytes32(0), address(this), address(this), 0, 123, 0);
        require(w.lastPremiumUsdcDeposited() == 123);
    }

    function testReactiveWatcherReservePolicyNoopPaths() public {
        GoldgardReactiveWatcher w = _watcher(address(0xCA11));
        w.onReserveBalanceChanged(0, 0, address(this));
        w.setReservePolicy(100, 0);
        w.onReserveBalanceChanged(99, 0, address(this));
        w.setReservePolicy(100, 1);
        w.onReserveBalanceChanged(100, 0, address(this));
    }

    function _dummyKey() internal pure returns (PoolKey memory) {
        return
            PoolKey({
                currency0: Currency.wrap(address(1)),
                currency1: Currency.wrap(address(2)),
                fee: 3000,
                tickSpacing: 60,
                hooks: IHooks(address(0))
            });
    }
}
