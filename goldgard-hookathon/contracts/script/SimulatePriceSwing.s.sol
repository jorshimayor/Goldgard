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
import {GoldgardHook} from "../src/GoldgardHook.sol";
import {HedgeReserve} from "../src/HedgeReserve.sol";

contract SimulatePriceSwing is Script {
    using stdJson for string;
    using PoolIdLibrary for PoolKey;
    using StateLibrary for IPoolManager;

    IPoolManager internal manager;
    SwapRouterNoChecks internal swapRouter;
    MockERC20 internal token0;
    MockERC20 internal token1;
    MockAggregatorV3 internal agg;
    GoldgardHook internal hook;
    HedgeReserve internal hedge;
    PoolKey internal key;
    PoolId internal poolId;
    uint256 internal startPrice1e18;

    function run() external {
        string memory configPath = vm.envOr("DEMO_CONFIG", string("../frontend/app/config/demoConfig.local.json"));
        string memory raw = vm.readFile(configPath);

        _loadFromConfig(raw);
        address trader = _startBroadcast();
        _tuneConfigs();
        _simulate(trader);
        vm.stopBroadcast();
    }

    function _loadFromConfig(string memory raw) internal {
        address managerAddr = raw.readAddress(".poolManager");
        address hookAddr = raw.readAddress(".hook");
        address token0Addr = raw.readAddress(".token0");
        address token1Addr = raw.readAddress(".token1");
        address swapRouterAddr = raw.readAddress(".swapRouter");
        address aggAddr = raw.readAddress(".mockAggregator");
        address hedgeAddr = raw.readAddress(".hedgeReserve");

        int24 tickSpacing = int24(int256(raw.readUint(".tickSpacing")));
        uint24 fee = uint24(raw.readUint(".fee"));

        manager = IPoolManager(managerAddr);
        swapRouter = SwapRouterNoChecks(payable(swapRouterAddr));
        token0 = MockERC20(token0Addr);
        token1 = MockERC20(token1Addr);
        agg = MockAggregatorV3(aggAddr);
        hook = GoldgardHook(hookAddr);
        hedge = HedgeReserve(hedgeAddr);

        key = PoolKey({
            currency0: Currency.wrap(token0Addr),
            currency1: Currency.wrap(token1Addr),
            fee: fee,
            tickSpacing: tickSpacing,
            hooks: IHooks(hookAddr)
        });

        poolId = key.toId();
        (uint160 startSqrtPriceX96,,,) = manager.getSlot0(poolId);
        startPrice1e18 = _priceFromSqrt(startSqrtPriceX96);
    }

    function _startBroadcast() internal returns (address trader) {
        uint256 pk = _privateKeyOrZero();
        if (pk != 0) {
            trader = vm.addr(pk);
            vm.startBroadcast(pk);
        } else {
            vm.startBroadcast();
            trader = tx.origin;
        }
    }

    function _tuneConfigs() internal {
        uint256 maxDevBps = vm.envOr(
            "MAX_SPOT_ORACLE_DEVIATION_BPS",
            uint256(type(uint16).max)
        );
        if (maxDevBps == 0) maxDevBps = type(uint16).max;
        if (maxDevBps > type(uint16).max) maxDevBps = type(uint16).max;
        try hedge.setMaxSpotOracleDeviationBps(uint16(maxDevBps)) {} catch {
            try hedge.setMaxSpotOracleDeviationBps(10_000) {} catch {}
        }

        (
            uint24 baseLpFee,
            uint24 maxLpFee,
            uint16 feeSlopeBps,
            uint16 deviationBps,
            uint16 circuitBreakerBps,
            uint16 rebalanceBps,
            uint32 twapWindowSeconds,
            uint32 circuitBreakerCooldownSeconds,
            uint64 pausedUntil
        ) = hook.poolConfig(poolId);

        GoldgardHook.PoolConfig memory cfg = GoldgardHook.PoolConfig({
            baseLpFee: baseLpFee,
            maxLpFee: maxLpFee,
            feeSlopeBps: feeSlopeBps,
            deviationBps: deviationBps,
            circuitBreakerBps: circuitBreakerBps,
            rebalanceBps: rebalanceBps,
            twapWindowSeconds: twapWindowSeconds,
            circuitBreakerCooldownSeconds: circuitBreakerCooldownSeconds,
            pausedUntil: pausedUntil
        });

        uint256 hookDevBps = vm.envOr(
            "HOOK_DEVIATION_BPS",
            uint256(type(uint16).max)
        );
        uint256 hookCbBps = vm.envOr(
            "HOOK_CIRCUIT_BREAKER_BPS",
            uint256(type(uint16).max)
        );
        uint256 hookCbCooldown = vm.envOr(
            "HOOK_CIRCUIT_BREAKER_COOLDOWN_SECONDS",
            uint256(0)
        );
        bool resetPause = vm.envOr("RESET_HOOK_PAUSE", true);

        if (hookDevBps > type(uint16).max) hookDevBps = type(uint16).max;
        if (hookCbBps > type(uint16).max) hookCbBps = type(uint16).max;
        if (hookCbCooldown > type(uint32).max) hookCbCooldown = type(uint32).max;

        cfg.deviationBps = uint16(hookDevBps);
        cfg.circuitBreakerBps = uint16(hookCbBps);
        cfg.circuitBreakerCooldownSeconds = uint32(hookCbCooldown);
        if (resetPause) cfg.pausedUntil = 0;

        try hook.setPoolConfig(key, cfg) {} catch {}
    }

    function _simulate(address trader) internal {
        uint256 bpsMove = vm.envOr("MOVE_BPS", uint256(1000));
        uint256 steps = vm.envOr("STEPS", uint256(5));
        uint256 amountPerStep = vm.envOr("AMOUNT_PER_STEP", uint256(10_000e18));
        bool priceUp = vm.envOr("DIRECTION_UP", true);

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
    }

    function _privateKeyOrZero() internal view returns (uint256 pk) {
        string memory raw = vm.envOr("PRIVATE_KEY", string(""));
        if (bytes(raw).length == 0) return 0;
        string memory trimmed = _trimLeft(raw);
        if (bytes(trimmed).length == 0) return 0;
        return vm.parseUint(trimmed);
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


    function _priceFromSqrt(uint160 sqrtPriceX96) internal pure returns (uint256 price1e18) {
        uint256 s = uint256(sqrtPriceX96);
        price1e18 = (s * s * 1e18) >> 192;
    }

    function _to1e8(uint256 price1e18) internal pure returns (uint256) {
        return price1e18 / 1e10;
    }
}
