// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC6909} from "v4-core/ERC6909.sol";
import {Ownable} from "openzeppelin-contracts/contracts/access/Ownable.sol";
import {
    Ownable2Step
} from "openzeppelin-contracts/contracts/access/Ownable2Step.sol";

contract RewardDistributor is ERC6909, Ownable2Step {
    error OnlyHook();

    uint256 public constant GGARD_ID = 1;

    address public hook;

    constructor(address _owner) Ownable(_owner) {}

    function setHook(address _hook) external onlyOwner {
        hook = _hook;
    }

    function mintReward(address to, uint256 amount) external {
        if (msg.sender != hook) revert OnlyHook();
        _mint(to, GGARD_ID, amount);
    }
}
