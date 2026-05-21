// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "forge-std/Script.sol";
import "forge-std/StdJson.sol";

interface IOracleAdapterView {
    function hook() external view returns (address);
}

interface IHedgeReserveView {
    function hook() external view returns (address);
}

interface IRewardDistributorView {
    function hook() external view returns (address);
}

interface IGoldgardHookView {
    function authorizedCaller() external view returns (address);
}

interface ISafetyModuleView {
    function authorizedCaller() external view returns (address);
}

interface IGoldgardCallbackReceiverView {
    function reactiveCallbackProxy() external view returns (address);
    function hook() external view returns (address);
    function safetyModule() external view returns (address);
}

contract ValidateDeployment is Script {
    using stdJson for string;

    function run() external view {
        string memory configPath = vm.envOr(
            "DEMO_CONFIG",
            string("../frontend/app/config/demoConfig.local.json")
        );
        string memory raw = vm.readFile(configPath);

        address hook = raw.readAddress(".hook");
        address safety = raw.readAddress(".safetyModule");
        address oracle = raw.readAddress(".oracleAdapter");
        address hedge = raw.readAddress(".hedgeReserve");
        address rewards = raw.readAddress(".rewards");
        address receiver = raw.readAddress(".callbackReceiver");

        require(hook != address(0));
        require(safety != address(0));
        require(oracle != address(0));
        require(hedge != address(0));
        require(rewards != address(0));
        require(receiver != address(0));

        require(IGoldgardHookView(hook).authorizedCaller() == receiver);
        require(ISafetyModuleView(safety).authorizedCaller() == receiver);

        require(IGoldgardCallbackReceiverView(receiver).hook() == hook);
        require(IGoldgardCallbackReceiverView(receiver).safetyModule() == safety);

        require(IOracleAdapterView(oracle).hook() == hook);
        require(IHedgeReserveView(hedge).hook() == hook);
        require(IRewardDistributorView(rewards).hook() == hook);

        address expectedReactiveProxy = vm.envOr(
            "REACTIVE_CALLBACK_PROXY",
            address(0)
        );
        if (expectedReactiveProxy != address(0)) {
            require(
                IGoldgardCallbackReceiverView(receiver).reactiveCallbackProxy() ==
                    expectedReactiveProxy
            );
        }
    }
}

