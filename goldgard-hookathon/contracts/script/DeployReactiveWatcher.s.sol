// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "forge-std/Script.sol";
import "forge-std/StdJson.sol";
import "forge-std/console2.sol";

import {GoldgardReactiveWatcher} from "../src/GoldgardReactiveWatcher.sol";

contract DeployReactiveWatcher is Script {
    using stdJson for string;

    function run() external returns (GoldgardReactiveWatcher watcher) {
        string memory configPath = vm.envOr(
            "DEMO_CONFIG",
            string("../frontend/app/config/demoConfig.sepolia.json")
        );
        string memory raw = vm.readFile(configPath);

        address callbackReceiver = raw.readAddress(".callbackReceiver");
        address oracleAdapter = raw.readAddress(".oracleAdapter");
        address hook = raw.readAddress(".hook");
        address safetyModule = raw.readAddress(".safetyModule");
        address hedgeReserve = raw.readAddress(".hedgeReserve");
        uint256 originChainId = raw.readUint(".chainId");

        callbackReceiver = vm.envOr("REACTIVE_CALLBACK_RECEIVER", callbackReceiver);
        oracleAdapter = vm.envOr("REACTIVE_ORACLE_SOURCE", oracleAdapter);
        hook = vm.envOr("REACTIVE_HOOK_SOURCE", hook);
        safetyModule = vm.envOr("REACTIVE_SAFETY_MODULE_SOURCE", safetyModule);
        hedgeReserve = vm.envOr("REACTIVE_HEDGE_RESERVE_SOURCE", hedgeReserve);

        uint256 destinationChainId = vm.envOr(
            "REACTIVE_DESTINATION_CHAIN_ID",
            originChainId
        );
        uint256 gasLimitRaw = vm.envOr("REACTIVE_CALLBACK_GAS_LIMIT", uint256(300_000));
        uint256 initialFunding = vm.envOr("REACTIVE_WATCHER_FUNDING_WEI", uint256(0.01 ether));
        bool subscribeOracle = vm.envOr("REACTIVE_SUBSCRIBE_ORACLE", true);
        bool subscribeHook = vm.envOr("REACTIVE_SUBSCRIBE_HOOK", false);
        bool subscribeSafetyModule = vm.envOr("REACTIVE_SUBSCRIBE_SAFETY_MODULE", false);
        bool subscribeHedgeReserve = vm.envOr("REACTIVE_SUBSCRIBE_HEDGE_RESERVE", false);
        uint256 oracleTopic0 = _envUintOr(
            "REACTIVE_ORACLE_TOPIC0",
            uint256(keccak256("OraclePriceUpdated(uint256,uint256,uint256,uint256)"))
        );
        uint256 premiumDivertedTopic0 = _envUintOr(
            "REACTIVE_HOOK_TOPIC0",
            uint256(
                keccak256("PremiumDiverted(bytes32,address,address,uint256,uint256,uint16)")
            )
        );
        uint256 claimPaidTopic0 = _envUintOr(
            "REACTIVE_SAFETY_MODULE_TOPIC0",
            uint256(keccak256("ClaimPaid(address,uint256,uint256)"))
        );
        uint256 reserveBalanceChangedTopic0 = _envUintOr(
            "REACTIVE_HEDGE_RESERVE_TOPIC0",
            uint256(keccak256("ReserveBalanceChanged(uint256,int256,address)"))
        );
        if (gasLimitRaw > type(uint64).max) gasLimitRaw = type(uint64).max;
        uint64 callbackGasLimit = uint64(gasLimitRaw);

        uint256 pk = _privateKeyRequired("REACTIVE_PRIVATE_KEY");
        address deployer = vm.addr(pk);
        address owner = vm.envOr("REACTIVE_OWNER", deployer);

        // Instrumentation: capture the exact tuple and deployer state before constructor execution.
        console2.log("reactiveDeploy.blockChainId", block.chainid);
        console2.log("reactiveDeploy.deployer", deployer);
        console2.log("reactiveDeploy.deployerBalance", deployer.balance);
        console2.log("reactiveDeploy.owner", owner);
        console2.log("reactiveDeploy.callbackReceiver", callbackReceiver);
        console2.log("reactiveDeploy.originChainId", originChainId);
        console2.log("reactiveDeploy.destinationChainId", destinationChainId);
        console2.log("reactiveDeploy.callbackGasLimit", callbackGasLimit);
        console2.log("reactiveDeploy.initialFundingWei", initialFunding);
        console2.log("reactiveDeploy.subscribeOracle", subscribeOracle);
        console2.log("reactiveDeploy.oracleSource", oracleAdapter);
        console2.log("reactiveDeploy.oracleTopic0", oracleTopic0);
        console2.log("reactiveDeploy.subscribeHook", subscribeHook);
        console2.log("reactiveDeploy.hookSource", hook);
        console2.log("reactiveDeploy.hookTopic0", premiumDivertedTopic0);
        console2.log("reactiveDeploy.subscribeSafetyModule", subscribeSafetyModule);
        console2.log("reactiveDeploy.safetyModuleSource", safetyModule);
        console2.log("reactiveDeploy.safetyModuleTopic0", claimPaidTopic0);
        console2.log("reactiveDeploy.subscribeHedgeReserve", subscribeHedgeReserve);
        console2.log("reactiveDeploy.hedgeReserveSource", hedgeReserve);
        console2.log("reactiveDeploy.hedgeReserveTopic0", reserveBalanceChangedTopic0);

        vm.startBroadcast(pk);
        try
            new GoldgardReactiveWatcher{value: initialFunding}(
                owner,
                callbackReceiver,
                originChainId,
                destinationChainId,
                callbackGasLimit,
                oracleAdapter,
                hook,
                safetyModule,
                hedgeReserve,
                oracleTopic0,
                premiumDivertedTopic0,
                claimPaidTopic0,
                reserveBalanceChangedTopic0,
                subscribeOracle,
                subscribeHook,
                subscribeSafetyModule,
                subscribeHedgeReserve
            )
        returns (GoldgardReactiveWatcher deployedWatcher) {
            watcher = deployedWatcher;
        } catch (bytes memory reason) {
            console2.log("reactiveDeploy.constructorFailed", true);
            console2.logBytes(reason);
            revert("reactive watcher deploy failed");
        }
        console2.log("reactiveDeploy.watcher", address(watcher));
        console2.log("reactiveDeploy.initializeSubscriptions.start", true);
        try watcher.initializeSubscriptions() {
            console2.log("reactiveDeploy.initializeSubscriptions.success", true);
        } catch (bytes memory reason) {
            console2.log("reactiveDeploy.initializeSubscriptions.failed", true);
            console2.logBytes(reason);
            revert("reactive watcher subscription init failed");
        }
        vm.stopBroadcast();

        console2.log("Reactive watcher deployed");
        console2.log("watcher", address(watcher));
        console2.log("originChainId", originChainId);
        console2.log("destinationChainId", destinationChainId);
        console2.log("callbackReceiver", callbackReceiver);
        console2.log("initialFundingWei", initialFunding);
        console2.log("subscribeOracle", subscribeOracle);
        console2.log("oracleSource", oracleAdapter);
        console2.log("oracleTopic0", oracleTopic0);
        console2.log("subscribeHook", subscribeHook);
        console2.log("hookSource", hook);
        console2.log("hookTopic0", premiumDivertedTopic0);
        console2.log("subscribeSafetyModule", subscribeSafetyModule);
        console2.log("safetyModuleSource", safetyModule);
        console2.log("safetyModuleTopic0", claimPaidTopic0);
        console2.log("subscribeHedgeReserve", subscribeHedgeReserve);
        console2.log("hedgeReserveSource", hedgeReserve);
        console2.log("hedgeReserveTopic0", reserveBalanceChangedTopic0);
    }

    function _envUintOr(string memory envKey, uint256 defaultValue) internal view returns (uint256) {
        string memory raw = vm.envOr(envKey, string(""));
        if (bytes(raw).length == 0) return defaultValue;
        return vm.parseUint(_normalizeUintString(_trimLeft(raw)));
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
