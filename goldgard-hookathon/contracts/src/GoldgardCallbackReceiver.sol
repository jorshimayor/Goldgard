pragma solidity ^0.8.24;

import {Ownable} from "openzeppelin-contracts/contracts/access/Ownable.sol";

interface IGoldgardHookAuthorized {
    function setAlertLevel(uint8 level) external;
    function setRebalanceThreshold(uint256 newThreshold) external;
    function setPremiumRate(uint256 newRateBps) external;
}

interface ISafetyModuleAuthorized {
    function epochCheckpoint() external;
}

contract GoldgardCallbackReceiver is Ownable {
    error OnlyReactiveCallbackProxy();
    error BadConfig();

    event TargetsSet(address indexed hook, address indexed safetyModule);
    event BoundsSet(
        uint8 maxAlertLevel,
        uint256 minRebalanceThreshold,
        uint256 maxRebalanceThreshold,
        uint16 maxPremiumRateBps
    );

    address public immutable reactiveCallbackProxy;

    address public hook;
    address public safetyModule;

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

    function setTargets(address _hook, address _safetyModule) external onlyOwner {
        hook = _hook;
        safetyModule = _safetyModule;
        emit TargetsSet(_hook, _safetyModule);
    }

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
        if (hook == address(0)) revert BadConfig();
        if (level > maxAlertLevel) revert BadConfig();
        IGoldgardHookAuthorized(hook).setAlertLevel(level);
    }

    function handleTightenThreshold(uint256 newThreshold) external onlyReactiveCallbackProxy {
        if (hook == address(0)) revert BadConfig();
        if (maxRebalanceThreshold != 0 && newThreshold > maxRebalanceThreshold)
            revert BadConfig();
        if (newThreshold < minRebalanceThreshold) revert BadConfig();
        IGoldgardHookAuthorized(hook).setRebalanceThreshold(newThreshold);
    }

    function handleAdjustPremiumRate(uint256 newRateBps) external onlyReactiveCallbackProxy {
        if (hook == address(0)) revert BadConfig();
        if (newRateBps > maxPremiumRateBps) revert BadConfig();
        IGoldgardHookAuthorized(hook).setPremiumRate(newRateBps);
    }

    function handleEpochCheckpoint() external onlyReactiveCallbackProxy {
        if (safetyModule == address(0)) revert BadConfig();
        ISafetyModuleAuthorized(safetyModule).epochCheckpoint();
    }
}

