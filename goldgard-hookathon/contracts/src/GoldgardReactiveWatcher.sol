pragma solidity ^0.8.24;

contract GoldgardReactiveWatcher {
    error BadConfig();

    event CallbackRequested(address indexed target, bytes data);

    address public immutable callbackReceiver;

    uint256 public earlyWarnBps;
    uint256 public slopeWarnBps;

    uint16 public alertLevelHigh;
    uint16 public alertLevelTrend;

    uint256 public reserveLowThreshold;
    uint256 public tightenThresholdValue;

    uint16 public premiumRateWhenImbalanced;
    uint256 public lastPremiumUsdcDeposited;

    uint64 public lastTimestamp;
    uint256 public lastDeviationBps;
    uint256 public lastSlopeBpsPerSecond;

    constructor(address _callbackReceiver) {
        if (_callbackReceiver == address(0)) revert BadConfig();
        callbackReceiver = _callbackReceiver;
        earlyWarnBps = 300;
        slopeWarnBps = 200;
        alertLevelHigh = 2;
        alertLevelTrend = 1;
        reserveLowThreshold = 0;
        tightenThresholdValue = 0;
        premiumRateWhenImbalanced = 0;
    }

    function setThresholds(uint256 _earlyWarnBps, uint256 _slopeWarnBps) external {
        if (_earlyWarnBps > 10_000) revert BadConfig();
        if (_slopeWarnBps > 10_000) revert BadConfig();
        earlyWarnBps = _earlyWarnBps;
        slopeWarnBps = _slopeWarnBps;
    }

    function setAlertLevels(uint16 _high, uint16 _trend) external {
        if (_high > 3) revert BadConfig();
        if (_trend > 3) revert BadConfig();
        alertLevelHigh = _high;
        alertLevelTrend = _trend;
    }

    function setReservePolicy(
        uint256 _reserveLowThreshold,
        uint256 _tightenThresholdValue
    ) external {
        reserveLowThreshold = _reserveLowThreshold;
        tightenThresholdValue = _tightenThresholdValue;
    }

    function setPremiumPolicy(uint16 _premiumRateWhenImbalanced) external {
        if (_premiumRateWhenImbalanced > 100) revert BadConfig();
        premiumRateWhenImbalanced = _premiumRateWhenImbalanced;
    }

    function onOraclePriceUpdated(
        uint256,
        uint256,
        uint256 deviationBps,
        uint256 timestamp
    ) external {
        uint64 t = uint64(timestamp);

        uint256 slope;
        if (lastTimestamp != 0 && t > lastTimestamp) {
            uint64 dt = t - lastTimestamp;
            uint256 prev = lastDeviationBps;
            if (deviationBps > prev) {
                slope = (deviationBps - prev) / uint256(dt);
            }
        }

        lastTimestamp = t;
        lastDeviationBps = deviationBps;
        lastSlopeBpsPerSecond = slope;

        uint8 level = 0;
        if (deviationBps >= earlyWarnBps) level = uint8(alertLevelHigh);
        else if (deviationBps >= slopeWarnBps && slope != 0)
            level = uint8(alertLevelTrend);

        if (level != 0) {
            bytes memory data = abi.encodeWithSignature(
                "handleAlertLevel(uint8)",
                level
            );
            emit CallbackRequested(callbackReceiver, data);
        }
    }

    function onReserveBalanceChanged(
        uint256 newBalance,
        int256,
        address
    ) external {
        uint256 low = reserveLowThreshold;
        if (low == 0) return;
        if (newBalance >= low) return;

        uint256 threshold = tightenThresholdValue;
        if (threshold == 0) return;

        bytes memory data = abi.encodeWithSignature(
            "handleTightenThreshold(uint256)",
            threshold
        );
        emit CallbackRequested(callbackReceiver, data);
    }

    function onPremiumDiverted(
        bytes32,
        address,
        address,
        uint256,
        uint256 usdcDeposited,
        uint16
    ) external {
        lastPremiumUsdcDeposited = usdcDeposited;
    }

    function onClaimPaid(address, uint256 amount, uint256) external {
        uint16 rate = premiumRateWhenImbalanced;
        if (rate == 0) return;
        if (amount == 0) return;

        bytes memory data = abi.encodeWithSignature(
            "handleAdjustPremiumRate(uint256)",
            uint256(rate)
        );
        emit CallbackRequested(callbackReceiver, data);
    }

    function onCron() external {
        bytes memory data = abi.encodeWithSignature("handleEpochCheckpoint()");
        emit CallbackRequested(callbackReceiver, data);
    }
}
