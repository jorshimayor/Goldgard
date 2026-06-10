// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "openzeppelin-contracts/contracts/access/Ownable.sol";
import {AbstractReactive} from "reactive-lib/abstract-base/AbstractReactive.sol";
import {IReactive} from "reactive-lib/interfaces/IReactive.sol";

/// @title Goldgard Reactive Watcher
/// @notice Lasna-side policy engine that watches Sepolia risk events and
///         requests bounded callbacks when early-warning conditions are met.
contract GoldgardReactiveWatcher is AbstractReactive, Ownable {
    error BadConfig();
    error UnsupportedEvent();
    error AlreadyInitialized();

    uint256 public constant ETH_SEPOLIA_CHAIN_ID = 11155111;
    uint256 public constant ORACLE_PRICE_UPDATED_TOPIC_0 =
        uint256(keccak256("OraclePriceUpdated(uint256,uint256,uint256,uint256)"));
    uint256 public constant PREMIUM_DIVERTED_TOPIC_0 =
        uint256(
            keccak256("PremiumDiverted(bytes32,address,address,uint256,uint256,uint16)")
        );
    uint256 public constant CLAIM_PAID_TOPIC_0 =
        uint256(keccak256("ClaimPaid(address,uint256,uint256)"));
    uint256 public constant RESERVE_BALANCE_CHANGED_TOPIC_0 =
        uint256(keccak256("ReserveBalanceChanged(uint256,int256,address)"));

    event CallbackRequested(address indexed target, bytes data);
    event SourceConfigured(
        uint256 indexed originChainId,
        address indexed oracleSource,
        address indexed hookSource
    );

    address public immutable callbackReceiver;
    uint256 public immutable originChainId;
    uint256 public immutable destinationChainId;
    uint64 public immutable callbackGasLimit;
    address public immutable oracleSource;
    address public immutable hookSource;
    address public immutable safetyModuleSource;
    address public immutable hedgeReserveSource;
    uint256 public immutable oracleTopic0;
    uint256 public immutable premiumDivertedTopic0;
    uint256 public immutable claimPaidTopic0;
    uint256 public immutable reserveBalanceChangedTopic0;
    bool public immutable subscribeOracle;
    bool public immutable subscribeHook;
    bool public immutable subscribeSafetyModule;
    bool public immutable subscribeHedgeReserve;
    bool public subscriptionsInitialized;

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

    /// @param _callbackReceiver Sepolia callback adapter that enforces Goldgard's trust boundary.
    /// @param _originChainId Chain that emits the source events, typically Sepolia.
    /// @param _destinationChainId Chain that receives the callback, also typically Sepolia.
    constructor(
        address _owner,
        address _callbackReceiver,
        uint256 _originChainId,
        uint256 _destinationChainId,
        uint64 _callbackGasLimit,
        address _oracleSource,
        address _hookSource,
        address _safetyModuleSource,
        address _hedgeReserveSource,
        uint256 _oracleTopic0,
        uint256 _premiumDivertedTopic0,
        uint256 _claimPaidTopic0,
        uint256 _reserveBalanceChangedTopic0,
        bool _subscribeOracle,
        bool _subscribeHook,
        bool _subscribeSafetyModule,
        bool _subscribeHedgeReserve
    ) payable Ownable(_owner) {
        if (_callbackReceiver == address(0)) revert BadConfig();
        if (_originChainId == 0 || _destinationChainId == 0) revert BadConfig();
        if (_callbackGasLimit == 0) revert BadConfig();

        if (_subscribeOracle && (_oracleSource == address(0) || _oracleTopic0 == 0)) revert BadConfig();
        if (_subscribeHook && (_hookSource == address(0) || _premiumDivertedTopic0 == 0)) {
            revert BadConfig();
        }
        if (
            _subscribeSafetyModule &&
            (_safetyModuleSource == address(0) || _claimPaidTopic0 == 0)
        ) revert BadConfig();
        if (
            _subscribeHedgeReserve &&
            (_hedgeReserveSource == address(0) || _reserveBalanceChangedTopic0 == 0)
        ) revert BadConfig();
        if (
            !_subscribeOracle &&
            !_subscribeHook &&
            !_subscribeSafetyModule &&
            !_subscribeHedgeReserve
        ) revert BadConfig();

        callbackReceiver = _callbackReceiver;
        originChainId = _originChainId;
        destinationChainId = _destinationChainId;
        callbackGasLimit = _callbackGasLimit;
        oracleSource = _oracleSource;
        hookSource = _hookSource;
        safetyModuleSource = _safetyModuleSource;
        hedgeReserveSource = _hedgeReserveSource;
        oracleTopic0 = _oracleTopic0;
        premiumDivertedTopic0 = _premiumDivertedTopic0;
        claimPaidTopic0 = _claimPaidTopic0;
        reserveBalanceChangedTopic0 = _reserveBalanceChangedTopic0;
        subscribeOracle = _subscribeOracle;
        subscribeHook = _subscribeHook;
        subscribeSafetyModule = _subscribeSafetyModule;
        subscribeHedgeReserve = _subscribeHedgeReserve;

        earlyWarnBps = 300;
        slopeWarnBps = 200;
        alertLevelHigh = 2;
        alertLevelTrend = 1;

        emit SourceConfigured(_originChainId, _oracleSource, _hookSource);
    }

    /// @notice Configures the deviation thresholds that produce alert callbacks.
    function setThresholds(uint256 _earlyWarnBps, uint256 _slopeWarnBps) external onlyOwner {
        if (_earlyWarnBps > 10_000) revert BadConfig();
        if (_slopeWarnBps > 10_000) revert BadConfig();
        earlyWarnBps = _earlyWarnBps;
        slopeWarnBps = _slopeWarnBps;
    }

    /// @notice Maps watcher states to the alert levels understood by the hook.
    function setAlertLevels(uint16 _high, uint16 _trend) external onlyOwner {
        if (_high > 3) revert BadConfig();
        if (_trend > 3) revert BadConfig();
        alertLevelHigh = _high;
        alertLevelTrend = _trend;
    }

    /// @notice Configures when reserve depletion should tighten rebalance policy.
    function setReservePolicy(
        uint256 _reserveLowThreshold,
        uint256 _tightenThresholdValue
    ) external onlyOwner {
        reserveLowThreshold = _reserveLowThreshold;
        tightenThresholdValue = _tightenThresholdValue;
    }

    /// @notice Configures the premium rate requested after claims are paid.
    function setPremiumPolicy(uint16 _premiumRateWhenImbalanced) external onlyOwner {
        if (_premiumRateWhenImbalanced > 100) revert BadConfig();
        premiumRateWhenImbalanced = _premiumRateWhenImbalanced;
    }

    /// @notice Reactive VM entrypoint that dispatches subscribed Sepolia events into policy handlers.
    function react(IReactive.LogRecord calldata log) external vmOnly {
        if (log.chain_id != originChainId) revert BadConfig();

        if (log._contract == oracleSource && log.topic_0 == oracleTopic0) {
            (, , uint256 deviationBps, uint256 timestamp) = abi.decode(
                log.data,
                (uint256, uint256, uint256, uint256)
            );
            _onOraclePriceUpdated(deviationBps, timestamp);
            return;
        }

        if (log._contract == hookSource && log.topic_0 == premiumDivertedTopic0) {
            (, , uint256 usdcDeposited, ) = abi.decode(
                log.data,
                (address, uint256, uint256, uint16)
            );
            _onPremiumDiverted(usdcDeposited);
            return;
        }

        if (log._contract == safetyModuleSource && log.topic_0 == claimPaidTopic0) {
            (uint256 amount, ) = abi.decode(log.data, (uint256, uint256));
            _onClaimPaid(amount);
            return;
        }

        if (
            log._contract == hedgeReserveSource &&
            log.topic_0 == reserveBalanceChangedTopic0
        ) {
            (uint256 newBalance, ) = abi.decode(log.data, (uint256, int256));
            _onReserveBalanceChanged(newBalance);
            return;
        }

        revert UnsupportedEvent();
    }

    /// @notice Owner-only helper for local testing of oracle alerts without a live subscription.
    function onOraclePriceUpdated(
        uint256,
        uint256,
        uint256 deviationBps,
        uint256 timestamp
    ) external onlyOwner {
        _onOraclePriceUpdated(deviationBps, timestamp);
    }

    /// @notice Owner-only helper for local testing of reserve events.
    function onReserveBalanceChanged(
        uint256 newBalance,
        int256,
        address
    ) external onlyOwner {
        _onReserveBalanceChanged(newBalance);
    }

    /// @notice Owner-only helper for local testing of premium diversion events.
    function onPremiumDiverted(
        bytes32,
        address,
        address,
        uint256,
        uint256 usdcDeposited,
        uint16
    ) external onlyOwner {
        _onPremiumDiverted(usdcDeposited);
    }

    /// @notice Owner-only helper for local testing of claim-paid events.
    function onClaimPaid(address, uint256 amount, uint256) external onlyOwner {
        _onClaimPaid(amount);
    }

    /// @notice Owner-only manual trigger for the periodic checkpoint callback.
    function onCron() external onlyOwner {
        _requestCallback(
            abi.encodeWithSignature("handleEpochCheckpoint(address)", address(0))
        );
    }

    /// @notice Performs the actual Reactive subscriptions after deployment.
    /// @dev Kept outside the constructor so failed subscription tuples are easier to debug on Lasna.
    function initializeSubscriptions() external onlyOwner {
        if (subscriptionsInitialized) revert AlreadyInitialized();
        subscriptionsInitialized = true;
        _subscribeAll();
    }

    function _subscribeAll() internal {
        if (!vm) {
            if (subscribeOracle) {
                // Oracle divergence events drive the earliest alerting policy.
                service.subscribe(
                    originChainId,
                    oracleSource,
                    oracleTopic0,
                    REACTIVE_IGNORE,
                    REACTIVE_IGNORE,
                    REACTIVE_IGNORE
                );
            }
            if (subscribeHook) {
                // Premium deposits are tracked so cross-chain policy can react to reserve inflows.
                service.subscribe(
                    originChainId,
                    hookSource,
                    premiumDivertedTopic0,
                    REACTIVE_IGNORE,
                    REACTIVE_IGNORE,
                    REACTIVE_IGNORE
                );
            }
            if (subscribeSafetyModule) {
                // Paid claims can trigger stricter premium policy.
                service.subscribe(
                    originChainId,
                    safetyModuleSource,
                    claimPaidTopic0,
                    REACTIVE_IGNORE,
                    REACTIVE_IGNORE,
                    REACTIVE_IGNORE
                );
            }
            if (subscribeHedgeReserve) {
                // Low reserve balance can tighten local rebalance constraints.
                service.subscribe(
                    originChainId,
                    hedgeReserveSource,
                    reserveBalanceChangedTopic0,
                    REACTIVE_IGNORE,
                    REACTIVE_IGNORE,
                    REACTIVE_IGNORE
                );
            }
        }
    }

    /// @dev Converts oracle divergence into a callback that raises hook alert levels.
    function _onOraclePriceUpdated(uint256 deviationBps, uint256 timestamp) internal {
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
        else if (deviationBps >= slopeWarnBps && slope != 0) level = uint8(alertLevelTrend);

        if (level != 0) {
            _requestCallback(
                abi.encodeWithSignature("handleAlertLevel(address,uint8)", address(0), level)
            );
        }
    }

    /// @dev Requests tighter rebalance settings when reserves fall below policy.
    function _onReserveBalanceChanged(uint256 newBalance) internal {
        uint256 low = reserveLowThreshold;
        if (low == 0) return;
        if (newBalance >= low) return;

        uint256 threshold = tightenThresholdValue;
        if (threshold == 0) return;

        _requestCallback(
            abi.encodeWithSignature(
                "handleTightenThreshold(address,uint256)",
                address(0),
                threshold
            )
        );
    }

    /// @dev Records the last premium deposit observed on Sepolia.
    function _onPremiumDiverted(uint256 usdcDeposited) internal {
        lastPremiumUsdcDeposited = usdcDeposited;
    }

    /// @dev Requests a higher premium rate after loss events when enabled.
    function _onClaimPaid(uint256 amount) internal {
        uint16 rate = premiumRateWhenImbalanced;
        if (rate == 0) return;
        if (amount == 0) return;

        _requestCallback(
            abi.encodeWithSignature(
                "handleAdjustPremiumRate(address,uint256)",
                address(0),
                uint256(rate)
            )
        );
    }

    /// @dev Emits both a local audit event and the Reactive callback request itself.
    function _requestCallback(bytes memory data) internal {
        emit CallbackRequested(callbackReceiver, data);
        emit Callback(destinationChainId, callbackReceiver, callbackGasLimit, data);
    }
}
