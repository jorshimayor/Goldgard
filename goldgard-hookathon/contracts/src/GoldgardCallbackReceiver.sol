// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "openzeppelin-contracts/contracts/access/Ownable.sol";

/// @notice Authorized control surface exposed by the hook to Reactive callbacks.
interface IGoldgardHookAuthorized {
    function setAlertLevel(uint8 level) external;
    function setRebalanceThreshold(uint256 newThreshold) external;
    function setPremiumRate(uint256 newRateBps) external;
}

/// @notice Authorized control surface exposed by the safety module to Reactive callbacks.
interface ISafetyModuleAuthorized {
    function epochCheckpoint() external;
}

/// @title Goldgard Reactive Callback Receiver
/// @notice Sepolia-side trust boundary for callbacks arriving from Reactive.
///         It validates the proxy/sender pair, bounds the requested action, and
///         then forwards a narrow command into the hook or safety module.
contract GoldgardCallbackReceiver is Ownable {
    error OnlyReactiveCallbackProxy();
    error BadConfig();

    event TargetsSet(address indexed hook, address indexed safetyModule);
    event ReactiveContractSet(address indexed reactiveContract);
    event BoundsSet(
        uint8 maxAlertLevel,
        uint256 minRebalanceThreshold,
        uint256 maxRebalanceThreshold,
        uint16 maxPremiumRateBps
    );
    event ReactiveAlertLevelHandled(uint8 level);
    event ReactiveTightenThresholdHandled(uint256 newThreshold);
    event ReactivePremiumRateHandled(uint256 newRateBps);
    event ReactiveEpochCheckpointHandled();

    address public immutable reactiveCallbackProxy;

    address public hook;
    address public safetyModule;
    address public reactiveContract;

    uint8 public maxAlertLevel;
    uint256 public minRebalanceThreshold;
    uint256 public maxRebalanceThreshold;
    uint16 public maxPremiumRateBps;

    constructor(
        address _owner,
        address _reactiveCallbackProxy,
        address _hook,
        address _safetyModule
    ) Ownable(_owner) {
        if (_reactiveCallbackProxy == address(0)) revert BadConfig();
        reactiveCallbackProxy = _reactiveCallbackProxy;
        maxAlertLevel = 3;
        maxPremiumRateBps = 100;
        hook = _hook;
        safetyModule = _safetyModule;
        emit TargetsSet(_hook, _safetyModule);
        emit BoundsSet(
            maxAlertLevel,
            minRebalanceThreshold,
            maxRebalanceThreshold,
            maxPremiumRateBps
        );
    }

    modifier onlyReactiveCallbackProxy() {
        if (msg.sender != reactiveCallbackProxy) revert OnlyReactiveCallbackProxy();
        _;
    }

    /// @notice Updates the Sepolia contracts that receive bounded Reactive actions.
    function setTargets(address _hook, address _safetyModule) external onlyOwner {
        hook = _hook;
        safetyModule = _safetyModule;
        emit TargetsSet(_hook, _safetyModule);
    }

    /// @notice Pins callbacks to a specific watcher contract once deployed.
    function setReactiveContract(address _reactiveContract) external onlyOwner {
        reactiveContract = _reactiveContract;
        emit ReactiveContractSet(_reactiveContract);
    }

    /// @notice Sets safety bounds for alert levels, threshold tightening, and premium changes.
    function setBounds(
        uint8 _maxAlertLevel,
        uint256 _minRebalanceThreshold,
        uint256 _maxRebalanceThreshold,
        uint16 _maxPremiumRateBps
    ) external onlyOwner {
        maxAlertLevel = _maxAlertLevel;
        minRebalanceThreshold = _minRebalanceThreshold;
        maxRebalanceThreshold = _maxRebalanceThreshold;
        maxPremiumRateBps = _maxPremiumRateBps;
        emit BoundsSet(
            _maxAlertLevel,
            _minRebalanceThreshold,
            _maxRebalanceThreshold,
            _maxPremiumRateBps
        );
    }

    function handleAlertLevel(uint8 level) external onlyReactiveCallbackProxy {
        _handleAlertLevel(level);
    }

    function handleAlertLevel(address callbackSender, uint8 level) external onlyReactiveCallbackProxy {
        _validateCallbackSender(callbackSender);
        _handleAlertLevel(level);
    }

    function _handleAlertLevel(uint8 level) internal {
        if (hook == address(0)) revert BadConfig();
        if (level > maxAlertLevel) revert BadConfig();
        IGoldgardHookAuthorized(hook).setAlertLevel(level);
        emit ReactiveAlertLevelHandled(level);
    }

    /// @notice Handles a threshold-tightening callback from Reactive.
    function handleTightenThreshold(uint256 newThreshold) external onlyReactiveCallbackProxy {
        _handleTightenThreshold(newThreshold);
    }

    function handleTightenThreshold(address callbackSender, uint256 newThreshold) external onlyReactiveCallbackProxy {
        _validateCallbackSender(callbackSender);
        _handleTightenThreshold(newThreshold);
    }

    function _handleTightenThreshold(uint256 newThreshold) internal {
        if (hook == address(0)) revert BadConfig();
        if (maxRebalanceThreshold != 0 && newThreshold > maxRebalanceThreshold)
            revert BadConfig();
        if (newThreshold < minRebalanceThreshold) revert BadConfig();
        IGoldgardHookAuthorized(hook).setRebalanceThreshold(newThreshold);
        emit ReactiveTightenThresholdHandled(newThreshold);
    }

    /// @notice Handles a premium-rate adjustment callback from Reactive.
    function handleAdjustPremiumRate(uint256 newRateBps) external onlyReactiveCallbackProxy {
        _handleAdjustPremiumRate(newRateBps);
    }

    function handleAdjustPremiumRate(address callbackSender, uint256 newRateBps) external onlyReactiveCallbackProxy {
        _validateCallbackSender(callbackSender);
        _handleAdjustPremiumRate(newRateBps);
    }

    function _handleAdjustPremiumRate(uint256 newRateBps) internal {
        if (hook == address(0)) revert BadConfig();
        if (newRateBps > maxPremiumRateBps) revert BadConfig();
        IGoldgardHookAuthorized(hook).setPremiumRate(newRateBps);
        emit ReactivePremiumRateHandled(newRateBps);
    }

    /// @notice Handles a scheduled epoch checkpoint request from Reactive.
    function handleEpochCheckpoint() external onlyReactiveCallbackProxy {
        _handleEpochCheckpoint();
    }

    function handleEpochCheckpoint(address callbackSender) external onlyReactiveCallbackProxy {
        _validateCallbackSender(callbackSender);
        _handleEpochCheckpoint();
    }

    function _handleEpochCheckpoint() internal {
        if (safetyModule == address(0)) revert BadConfig();
        ISafetyModuleAuthorized(safetyModule).epochCheckpoint();
        emit ReactiveEpochCheckpointHandled();
    }

    /// @dev When a watcher address is configured, only that watcher may be the callback sender.
    function _validateCallbackSender(address callbackSender) internal view {
        if (reactiveContract != address(0) && callbackSender != reactiveContract) revert BadConfig();
    }
}
