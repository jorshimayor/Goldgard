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

    error OnlyHook();
    error ClaimPending();
    error CooldownNotPassed();
    error NotEligible();
    error ZeroPayout();

    uint64 public constant COOLDOWN_SECONDS = 14 days;

    address public hook;
    IGoldgardClaimsView public claimsView;

    mapping(address => mapping(PoolId => uint64)) public claimRequestedAt;

    constructor(
        address _owner,
        IERC20 _asset,
        string memory name_,
        string memory symbol_
    ) ERC20(name_, symbol_) ERC4626(_asset) Ownable(_owner) {}

    function setHook(address _hook) external onlyOwner {
        hook = _hook;
    }

    function setClaimsView(IGoldgardClaimsView _claimsView) external onlyOwner {
        claimsView = _claimsView;
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
        uint64 t = claimRequestedAt[msg.sender][poolId];
        if (t == 0) revert ClaimPending();
        if (block.timestamp < uint256(t) + COOLDOWN_SECONDS)
            revert CooldownNotPassed();

        if (!claimsView.isEligible(msg.sender, poolId)) revert NotEligible();

        payoutAssets = claimsView.previewClaim(msg.sender, poolId);
        if (payoutAssets == 0) revert ZeroPayout();

        claimRequestedAt[msg.sender][poolId] = 0;
        withdraw(payoutAssets, msg.sender, address(this));
    }
}
