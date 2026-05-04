// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract MockAggregatorV3 {
    uint8 public immutable decimals;

    int256 public answer;
    uint256 public updatedAt;

    constructor(uint8 _decimals, int256 _answer) {
        decimals = _decimals;
        answer = _answer;
        updatedAt = block.timestamp;
    }

    function setAnswer(int256 _answer) external {
        answer = _answer;
        updatedAt = block.timestamp;
    }

    function latestRoundData()
        external
        view
        returns (
            uint80 roundId,
            int256 _answer,
            uint256 startedAt,
            uint256 _updatedAt,
            uint80 answeredInRound
        )
    {
        return (0, answer, updatedAt, updatedAt, 0);
    }
}
