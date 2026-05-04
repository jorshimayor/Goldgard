// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

library Transient {
    function tstoreU256(bytes32 slot, uint256 value) internal {
        assembly ("memory-safe") {
            tstore(slot, value)
        }
    }

    function tloadU256(bytes32 slot) internal view returns (uint256 value) {
        assembly ("memory-safe") {
            value := tload(slot)
        }
    }

    function tstoreI256(bytes32 slot, int256 value) internal {
        assembly ("memory-safe") {
            tstore(slot, value)
        }
    }

    function tloadI256(bytes32 slot) internal view returns (int256 value) {
        assembly ("memory-safe") {
            value := tload(slot)
        }
    }
}
