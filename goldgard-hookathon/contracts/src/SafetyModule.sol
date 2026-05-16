// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {
    Ownable2Step
} from "openzeppelin-contracts/contracts/access/Ownable2Step.sol";
import {Ownable} from "openzeppelin-contracts/contracts/access/Ownable.sol";
import {ERC20} from "openzeppelin-contracts/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";
import {
    SafeERC20
} from "openzeppelin-contracts/contracts/token/ERC20/utils/SafeERC20.sol";
import {
    ERC4626
} from "openzeppelin-contracts/contracts/token/ERC20/extensions/ERC4626.sol";

import {PoolId} from "v4-core/types/PoolId.sol";

interface IGoldgardClaimsView {
    function isEligible(
        address account,
        PoolId poolId
    ) external view returns (bool);
    function previewClaim(
        address account,
        PoolId poolId
    ) external view returns (uint256 payoutAssets);
}

contract SafetyModule is ERC4626, Ownable2Step {
    using SafeERC20 for IERC20;

    error BadConfig();
    error OnlyHook();
    error ClaimPending();
    error CooldownNotPassed();
    error ClaimsPaused();
    error NotEligible();
    error ZeroPayout();
    error ClaimsViewAlreadySet();
    error ClaimsViewNotSet();
    error NoPendingClaimsView();
    error ClaimsViewNotReady();

    uint64 public constant DEFAULT_COOLDOWN_SECONDS = 14 days;
    uint64 public constant MAX_COOLDOWN_SECONDS = 365 days;

    address public hook;
    IGoldgardClaimsView public claimsView;
    IGoldgardClaimsView public pendingClaimsView;

    bool public claimsPaused;
    uint64 public cooldownSeconds;
    uint64 public claimsViewChangeDelay;
    uint64 public pendingClaimsViewValidAt;

    event ClaimsPausedSet(bool paused);
    event CooldownSecondsSet(uint64 cooldownSeconds);
    event ClaimsViewDelaySet(uint64 delaySeconds);
    event ClaimsViewChangeScheduled(address indexed pending, uint64 validAt);
    event ClaimsViewChanged(address indexed claimsView);

    mapping(address => mapping(PoolId => uint64)) public claimRequestedAt;

    constructor(
        address _owner,
        IERC20 _asset,
        string memory name_,
        string memory symbol_
    ) ERC20(name_, symbol_) ERC4626(_asset) Ownable(_owner) {
        cooldownSeconds = DEFAULT_COOLDOWN_SECONDS;
        claimsViewChangeDelay = 2 days;
    }

    function setHook(address _hook) external onlyOwner {
        hook = _hook;
    }

    function setClaimsView(IGoldgardClaimsView _claimsView) external onlyOwner {
        if (address(claimsView) != address(0)) revert ClaimsViewAlreadySet();
        claimsView = _claimsView;
        emit ClaimsViewChanged(address(_claimsView));
    }

    function setClaimsPaused(bool paused) external onlyOwner {
        claimsPaused = paused;
        emit ClaimsPausedSet(paused);
    }

    function setCooldownSeconds(uint64 newCooldownSeconds) external onlyOwner {
        if (newCooldownSeconds > MAX_COOLDOWN_SECONDS) revert BadConfig();
        cooldownSeconds = newCooldownSeconds;
        emit CooldownSecondsSet(newCooldownSeconds);
    }

    function setClaimsViewChangeDelay(uint64 delaySeconds) external onlyOwner {
        if (delaySeconds > 30 days) revert BadConfig();
        claimsViewChangeDelay = delaySeconds;
        emit ClaimsViewDelaySet(delaySeconds);
    }

    function scheduleClaimsViewChange(
        IGoldgardClaimsView _claimsView
    ) external onlyOwner {
        if (address(claimsView) == address(0)) revert ClaimsViewNotSet();
        pendingClaimsView = _claimsView;
        pendingClaimsViewValidAt = uint64(block.timestamp) + claimsViewChangeDelay;
        emit ClaimsViewChangeScheduled(
            address(_claimsView),
            pendingClaimsViewValidAt
        );
    }

    function cancelClaimsViewChange() external onlyOwner {
        pendingClaimsView = IGoldgardClaimsView(address(0));
        pendingClaimsViewValidAt = 0;
    }

    function acceptClaimsViewChange() external {
        if (address(pendingClaimsView) == address(0)) revert NoPendingClaimsView();
        if (block.timestamp < pendingClaimsViewValidAt) revert ClaimsViewNotReady();
        claimsView = pendingClaimsView;
        pendingClaimsView = IGoldgardClaimsView(address(0));
        pendingClaimsViewValidAt = 0;
        emit ClaimsViewChanged(address(claimsView));
    }

    function depositPremium(
        uint256 amount
    ) external returns (uint256 sharesMinted) {
        if (msg.sender != hook) revert OnlyHook();
        sharesMinted = deposit(amount, address(this));
    }

    function requestClaim(PoolId poolId) external {
        if (claimRequestedAt[msg.sender][poolId] != 0) revert ClaimPending();
        claimRequestedAt[msg.sender][poolId] = uint64(block.timestamp);
    }

    function executeClaim(
        PoolId poolId
    ) external returns (uint256 payoutAssets) {
        if (claimsPaused) revert ClaimsPaused();
        if (address(claimsView) == address(0)) revert ClaimsViewNotSet();
        uint64 t = claimRequestedAt[msg.sender][poolId];
        if (t == 0) revert ClaimPending();
        if (block.timestamp < uint256(t) + uint256(cooldownSeconds))
            revert CooldownNotPassed();

        if (!claimsView.isEligible(msg.sender, poolId)) revert NotEligible();

        payoutAssets = claimsView.previewClaim(msg.sender, poolId);
        uint256 available = IERC20(asset()).balanceOf(address(this));
        if (payoutAssets > available) payoutAssets = available;
        if (payoutAssets == 0) revert ZeroPayout();

        claimRequestedAt[msg.sender][poolId] = 0;
        uint256 shares = previewWithdraw(payoutAssets);
        _withdraw(address(this), msg.sender, address(this), payoutAssets, shares);
    }
}
