// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {Math} from "openzeppelin-contracts/contracts/utils/math/Math.sol";

contract GoldgardMathFuzzTest is Test {
    uint256 internal constant BPS = 10_000;

    function testFuzz_ilBpsIsBounded(uint256 r) public pure {
        r = _boundRatio(r);
        uint256 bps = _impermanentLossBps(r);
        require(bps <= BPS);
    }

    function testFuzz_ilBpsIsZeroAtOne(uint256 noise) public pure {
        noise = noise;
        uint256 bps = _impermanentLossBps(1e18);
        require(bps == 0);
    }

    function testFuzz_ilBpsIsSymmetric(uint256 r) public pure {
        r = _boundRatio(r);

        uint256 inv = Math.mulDiv(1e36, 1, r);
        uint256 a = _impermanentLossBps(r);
        uint256 b = _impermanentLossBps(inv);
        uint256 diff = a > b ? a - b : b - a;
        require(diff <= 2);
    }

    function _boundRatio(uint256 r) internal pure returns (uint256) {
        if (r < 1e12) return 1e12;
        if (r > 1e24) return 1e24;
        return r;
    }

    function _impermanentLossBps(uint256 priceRatio1e18) internal pure returns (uint256) {
        if (priceRatio1e18 == 0) return 0;
        uint256 sqrtR1e18 = Math.sqrt(priceRatio1e18 * 1e18);
        uint256 factor1e18 = Math.mulDiv(2 * sqrtR1e18, 1e18, 1e18 + priceRatio1e18);
        if (factor1e18 >= 1e18) return 0;
        return Math.mulDiv(1e18 - factor1e18, BPS, 1e18);
    }
}

