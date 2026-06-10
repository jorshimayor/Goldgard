// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "forge-std/Script.sol";
import "forge-std/console2.sol";

import {ReactiveSubscribeProbe} from "../src/ReactiveSubscribeProbe.sol";

contract DeployReactiveSubscribeProbe is Script {
    function run() external returns (ReactiveSubscribeProbe probe) {
        uint256 pk = _privateKeyRequired("REACTIVE_PRIVATE_KEY");
        address deployer = vm.addr(pk);
        address owner = vm.envOr("REACTIVE_OWNER", deployer);
        uint256 funding = vm.envOr("REACTIVE_PROBE_FUNDING_WEI", uint256(0.01 ether));

        console2.log("reactiveProbe.blockChainId", block.chainid);
        console2.log("reactiveProbe.deployer", deployer);
        console2.log("reactiveProbe.deployerBalance", deployer.balance);
        console2.log("reactiveProbe.owner", owner);
        console2.log("reactiveProbe.fundingWei", funding);

        vm.startBroadcast(pk);
        probe = new ReactiveSubscribeProbe{value: funding}(owner);
        vm.stopBroadcast();

        console2.log("reactiveProbe.address", address(probe));
    }

    function _privateKeyRequired(string memory envKey) internal view returns (uint256) {
        string memory raw = vm.envOr(envKey, string(""));
        require(bytes(raw).length != 0, "missing private key");
        return vm.parseUint(_normalizeUintString(_trimLeft(raw)));
    }

    function _trimLeft(string memory s) internal pure returns (string memory) {
        bytes memory b = bytes(s);
        uint256 i = 0;
        while (i < b.length) {
            bytes1 c = b[i];
            if (c != 0x20 && c != 0x09 && c != 0x0a && c != 0x0d) break;
            unchecked {
                i++;
            }
        }
        if (i == 0) return s;
        bytes memory out = new bytes(b.length - i);
        for (uint256 j = 0; j < out.length; j++) {
            out[j] = b[i + j];
        }
        return string(out);
    }

    function _normalizeUintString(string memory s) internal pure returns (string memory) {
        bytes memory b = bytes(s);
        if (b.length >= 2 && b[0] == bytes1("0") && (b[1] == bytes1("x") || b[1] == bytes1("X"))) {
            return s;
        }
        if (_isHex64(b)) return string.concat("0x", s);
        return s;
    }

    function _isHex64(bytes memory b) internal pure returns (bool) {
        if (b.length != 64) return false;
        for (uint256 i = 0; i < 64; i++) {
            if (!_isHexChar(b[i])) return false;
        }
        return true;
    }

    function _isHexChar(bytes1 c) internal pure returns (bool) {
        return (c >= bytes1("0") && c <= bytes1("9")) ||
            (c >= bytes1("a") && c <= bytes1("f")) ||
            (c >= bytes1("A") && c <= bytes1("F"));
    }
}
