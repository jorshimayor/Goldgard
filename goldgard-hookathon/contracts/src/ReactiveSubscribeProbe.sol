// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "openzeppelin-contracts/contracts/access/Ownable.sol";
import {AbstractReactive} from "reactive-lib/abstract-base/AbstractReactive.sol";

/// @title Reactive Subscription Probe
/// @notice Debug helper deployed on Lasna to prove whether a specific
///         subscription tuple is accepted by the Reactive system contract.
contract ReactiveSubscribeProbe is AbstractReactive, Ownable {
    event ProbeSubscriptionRequested(
        uint256 indexed chainId,
        address indexed source,
        uint256 indexed topic0,
        uint256 topic1,
        uint256 topic2,
        uint256 topic3
    );

    constructor(address initialOwner) payable Ownable(initialOwner) {}

    /// @notice Attempts a single subscription tuple and emits the exact values used.
    function probeSubscribe(
        uint256 chainId,
        address source,
        uint256 topic0,
        uint256 topic1,
        uint256 topic2,
        uint256 topic3
    ) external onlyOwner {
        emit ProbeSubscriptionRequested(chainId, source, topic0, topic1, topic2, topic3);
        service.subscribe(chainId, source, topic0, topic1, topic2, topic3);
    }

    /// @notice This contract is only used to validate subscriptions, not callbacks.
    function react(LogRecord calldata) external pure override {
        revert("probe-only");
    }
}
