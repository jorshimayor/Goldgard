// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "forge-std/Script.sol";
import "forge-std/StdJson.sol";

interface IGoldgardCallbackReceiverReactiveView {
    function hook() external view returns (address);
    function safetyModule() external view returns (address);
    function reactiveContract() external view returns (address);
}

interface IGoldgardReactiveWatcherView {
    function callbackReceiver() external view returns (address);
    function originChainId() external view returns (uint256);
    function destinationChainId() external view returns (uint256);
    function callbackGasLimit() external view returns (uint64);
    function oracleSource() external view returns (address);
    function hookSource() external view returns (address);
    function safetyModuleSource() external view returns (address);
    function hedgeReserveSource() external view returns (address);
    function oracleTopic0() external view returns (uint256);
    function premiumDivertedTopic0() external view returns (uint256);
    function claimPaidTopic0() external view returns (uint256);
    function reserveBalanceChangedTopic0() external view returns (uint256);
    function subscribeOracle() external view returns (bool);
    function subscribeHook() external view returns (bool);
    function subscribeSafetyModule() external view returns (bool);
    function subscribeHedgeReserve() external view returns (bool);
}

contract ValidateReactiveDeployment is Script {
    using stdJson for string;

    function run() external view {
        string memory configPath = vm.envOr(
            "DEMO_CONFIG",
            string("../frontend/app/config/demoConfig.sepolia.json")
        );
        string memory raw = vm.readFile(configPath);

        address hook = raw.readAddress(".hook");
        address safety = raw.readAddress(".safetyModule");
        address oracle = raw.readAddress(".oracleAdapter");
        address hedge = raw.readAddress(".hedgeReserve");
        address receiver = raw.readAddress(".callbackReceiver");
        uint256 originChainId = raw.readUint(".chainId");
        receiver = vm.envOr("REACTIVE_CALLBACK_RECEIVER", receiver);
        oracle = vm.envOr("REACTIVE_ORACLE_SOURCE", oracle);
        hook = vm.envOr("REACTIVE_HOOK_SOURCE", hook);
        safety = vm.envOr("REACTIVE_SAFETY_MODULE_SOURCE", safety);
        hedge = vm.envOr("REACTIVE_HEDGE_RESERVE_SOURCE", hedge);

        address watcher = vm.envAddress("REACTIVE_WATCHER");
        uint256 destinationChainId = vm.envOr(
            "REACTIVE_DESTINATION_CHAIN_ID",
            originChainId
        );
        uint256 gasLimit = vm.envOr("REACTIVE_CALLBACK_GAS_LIMIT", uint256(300_000));
        bool subscribeOracle = vm.envOr("REACTIVE_SUBSCRIBE_ORACLE", true);
        bool subscribeHook = vm.envOr("REACTIVE_SUBSCRIBE_HOOK", false);
        bool subscribeSafety = vm.envOr("REACTIVE_SUBSCRIBE_SAFETY_MODULE", false);
        bool subscribeHedge = vm.envOr("REACTIVE_SUBSCRIBE_HEDGE_RESERVE", false);
        uint256 oracleTopic0 = _envUintOr(
            "REACTIVE_ORACLE_TOPIC0",
            uint256(keccak256("OraclePriceUpdated(uint256,uint256,uint256,uint256)"))
        );
        uint256 hookTopic0 = _envUintOr(
            "REACTIVE_HOOK_TOPIC0",
            uint256(
                keccak256("PremiumDiverted(bytes32,address,address,uint256,uint256,uint16)")
            )
        );
        uint256 safetyTopic0 = _envUintOr(
            "REACTIVE_SAFETY_MODULE_TOPIC0",
            uint256(keccak256("ClaimPaid(address,uint256,uint256)"))
        );
        uint256 hedgeTopic0 = _envUintOr(
            "REACTIVE_HEDGE_RESERVE_TOPIC0",
            uint256(keccak256("ReserveBalanceChanged(uint256,int256,address)"))
        );

        require(receiver.code.length > 0, "receiver has no code");
        require(watcher.code.length > 0, "watcher has no code");

        IGoldgardCallbackReceiverReactiveView receiverView = IGoldgardCallbackReceiverReactiveView(
            receiver
        );
        IGoldgardReactiveWatcherView watcherView = IGoldgardReactiveWatcherView(
            watcher
        );

        require(receiverView.hook() == hook, "receiver hook mismatch");
        require(receiverView.safetyModule() == safety, "receiver safety mismatch");
        require(receiverView.reactiveContract() == watcher, "receiver reactive watcher mismatch");

        require(watcherView.callbackReceiver() == receiver, "watcher receiver mismatch");
        require(watcherView.originChainId() == originChainId, "watcher origin chain mismatch");
        require(
            watcherView.destinationChainId() == destinationChainId,
            "watcher destination chain mismatch"
        );
        require(watcherView.callbackGasLimit() == gasLimit, "watcher callback gas mismatch");
        require(watcherView.oracleSource() == oracle, "watcher oracle mismatch");
        require(watcherView.hookSource() == hook, "watcher hook mismatch");
        require(watcherView.safetyModuleSource() == safety, "watcher safety mismatch");
        require(watcherView.hedgeReserveSource() == hedge, "watcher hedge mismatch");
        require(watcherView.oracleTopic0() == oracleTopic0, "watcher oracle topic mismatch");
        require(watcherView.premiumDivertedTopic0() == hookTopic0, "watcher hook topic mismatch");
        require(watcherView.claimPaidTopic0() == safetyTopic0, "watcher safety topic mismatch");
        require(
            watcherView.reserveBalanceChangedTopic0() == hedgeTopic0,
            "watcher hedge topic mismatch"
        );
        require(watcherView.subscribeOracle() == subscribeOracle, "watcher oracle toggle mismatch");
        require(watcherView.subscribeHook() == subscribeHook, "watcher hook toggle mismatch");
        require(
            watcherView.subscribeSafetyModule() == subscribeSafety,
            "watcher safety toggle mismatch"
        );
        require(
            watcherView.subscribeHedgeReserve() == subscribeHedge,
            "watcher hedge toggle mismatch"
        );
    }

    function _envUintOr(string memory envKey, uint256 defaultValue) internal view returns (uint256) {
        string memory raw = vm.envOr(envKey, string(""));
        if (bytes(raw).length == 0) return defaultValue;
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
