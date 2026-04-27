// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "forge-std/StdJson.sol";

import {IPoolManager} from "v4-core/interfaces/IPoolManager.sol";
import {PoolKey} from "v4-core/types/PoolKey.sol";
import {Currency} from "v4-core/types/Currency.sol";
import {IHooks} from "v4-core/interfaces/IHooks.sol";
import {PoolId, PoolIdLibrary} from "v4-core/types/PoolId.sol";
import {SwapParams} from "v4-core/types/PoolOperation.sol";
import {StateLibrary} from "v4-core/libraries/StateLibrary.sol";
import {TickMath} from "v4-core/libraries/TickMath.sol";

import {SwapRouterNoChecks} from "v4-core/test/SwapRouterNoChecks.sol";
import {MockERC20} from "solmate/src/test/utils/mocks/MockERC20.sol";

import {MockAggregatorV3} from "../src/mocks/MockAggregatorV3.sol";

contract SimulatePriceSwing is Script {
    using stdJson for string;
    using PoolIdLibrary for PoolKey;
    using StateLibrary for IPoolManager;

    function run() external {
        string memory configPath = vm.envOr("DEMO_CONFIG", string("../frontend/app/config/demoConfig.local.json"));
        string memory raw = vm.readFile(configPath);

        address managerAddr = raw.readAddress(".poolManager");
        address hookAddr = raw.readAddress(".hook");
        address token0Addr = raw.readAddress(".token0");
        address token1Addr = raw.readAddress(".token1");
        address swapRouterAddr = raw.readAddress(".swapRouter");
        address aggAddr = raw.readAddress(".mockAggregator");

        int24 tickSpacing = int24(int256(raw.readUint(".tickSpacing")));
        uint24 fee = uint24(raw.readUint(".fee"));

        IPoolManager manager = IPoolManager(managerAddr);
        SwapRouterNoChecks swapRouter = SwapRouterNoChecks(payable(swapRouterAddr));
        MockERC20 token0 = MockERC20(token0Addr);
        MockERC20 token1 = MockERC20(token1Addr);
        MockAggregatorV3 agg = MockAggregatorV3(aggAddr);

        PoolKey memory key = PoolKey({
            currency0: Currency.wrap(token0Addr),
            currency1: Currency.wrap(token1Addr),
            fee: fee,
            tickSpacing: tickSpacing,
            hooks: IHooks(hookAddr)
        });

        PoolId poolId = key.toId();
        (uint160 startSqrtPriceX96,,,) = manager.getSlot0(poolId);
        uint256 startPrice1e18 = _priceFromSqrt(startSqrtPriceX96);

        uint256 bpsMove = vm.envOr("MOVE_BPS", uint256(1000));
        uint256 steps = vm.envOr("STEPS", uint256(5));
        uint256 amountPerStep = vm.envOr("AMOUNT_PER_STEP", uint256(10_000e18));

        bool priceUp = vm.envOr("DIRECTION_UP", true);

        uint256 pk = vm.envUint("PRIVATE_KEY");
        address trader = vm.addr(pk);
        vm.startBroadcast(pk);

        for (uint256 i = 1; i <= steps; i++) {
            uint256 stepBps = (bpsMove * i) / steps;
            uint256 target = priceUp
                ? (startPrice1e18 * (10_000 + stepBps)) / 10_000
                : (startPrice1e18 * (10_000 - stepBps)) / 10_000;

            agg.setAnswer(int256(_to1e8(target)));

            if (priceUp) {
                token1.mint(trader, amountPerStep);
                token1.approve(address(swapRouter), amountPerStep);
                SwapParams memory p = SwapParams({
                    zeroForOne: false,
                    amountSpecified: -int256(amountPerStep),
                    sqrtPriceLimitX96: TickMath.MAX_SQRT_PRICE - 1
                });
                swapRouter.swap(key, p);
            } else {
                token0.mint(trader, amountPerStep);
                token0.approve(address(swapRouter), amountPerStep);
                SwapParams memory p = SwapParams({
                    zeroForOne: true,
                    amountSpecified: -int256(amountPerStep),
                    sqrtPriceLimitX96: TickMath.MIN_SQRT_PRICE + 1
                });
                swapRouter.swap(key, p);
            }
        }

        vm.stopBroadcast();
    }

    function _priceFromSqrt(uint160 sqrtPriceX96) internal pure returns (uint256 price1e18) {
        uint256 s = uint256(sqrtPriceX96);
        price1e18 = (s * s * 1e18) >> 192;
    }

    function _to1e8(uint256 price1e18) internal pure returns (uint256) {
        return price1e18 / 1e10;
    }
}
