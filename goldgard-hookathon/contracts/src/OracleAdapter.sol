// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "openzeppelin-contracts/contracts/access/Ownable.sol";
import {Ownable2Step} from "openzeppelin-contracts/contracts/access/Ownable2Step.sol";
import {Math} from "openzeppelin-contracts/contracts/utils/math/Math.sol";

import {PoolKey} from "v4-core/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "v4-core/types/PoolId.sol";
import {IPoolManager} from "v4-core/interfaces/IPoolManager.sol";
import {StateLibrary} from "v4-core/libraries/StateLibrary.sol";

import {IChainlinkAggregatorV3} from "./interfaces/IChainlinkAggregatorV3.sol";

contract OracleAdapter is Ownable2Step {
    using PoolIdLibrary for PoolKey;
    using StateLibrary for IPoolManager;

    error OnlyHook();
    error BadConfig();

    struct PoolOracleConfig {
        IChainlinkAggregatorV3 aggregator;
        uint32 maxStaleSeconds;
        uint8 aggregatorDecimals;
        uint8 token0Decimals;
        uint8 token1Decimals;
    }

    struct Observation {
        uint64 lastUpdated;
        uint160 lastSqrtPriceX96;
        uint256 sqrtPriceX96Cumulative;
    }

    address public hook;

    mapping(PoolId => PoolOracleConfig) public poolOracle;
    mapping(PoolId => Observation) public observations;

    constructor(address _owner) Ownable(_owner) {}

    function setHook(address _hook) external onlyOwner {
        hook = _hook;
    }

    function setPoolOracleConfig(PoolKey calldata key, PoolOracleConfig calldata cfg) external onlyOwner {
        if (cfg.maxStaleSeconds == 0) revert BadConfig();
        poolOracle[key.toId()] = PoolOracleConfig({
            aggregator: cfg.aggregator,
            maxStaleSeconds: cfg.maxStaleSeconds,
            aggregatorDecimals: cfg.aggregatorDecimals,
            token0Decimals: cfg.token0Decimals,
            token1Decimals: cfg.token1Decimals
        });
    }

    function updateFromPool(IPoolManager manager, PoolKey calldata key) external {
        if (msg.sender != hook) revert OnlyHook();

        PoolId poolId = key.toId();
        (uint160 sqrtPriceX96,,,) = manager.getSlot0(poolId);

        Observation storage obs = observations[poolId];

        uint64 t = uint64(block.timestamp);
        if (obs.lastUpdated == 0) {
            obs.lastUpdated = t;
            obs.lastSqrtPriceX96 = sqrtPriceX96;
            return;
        }

        uint64 dt = t - obs.lastUpdated;
        if (dt == 0) {
            obs.lastSqrtPriceX96 = sqrtPriceX96;
            return;
        }

        obs.sqrtPriceX96Cumulative += uint256(obs.lastSqrtPriceX96) * uint256(dt);
        obs.lastUpdated = t;
        obs.lastSqrtPriceX96 = sqrtPriceX96;
    }

    function getTwapSqrtPriceX96(PoolKey calldata key, uint32 windowSeconds) external view returns (uint160) {
        PoolId poolId = key.toId();
        Observation memory obs = observations[poolId];
        if (obs.lastUpdated == 0) return 0;

        uint64 t = uint64(block.timestamp);
        uint64 dt = t - obs.lastUpdated;
        uint256 cumulative = obs.sqrtPriceX96Cumulative + uint256(obs.lastSqrtPriceX96) * uint256(dt);

        uint64 effectiveWindow = windowSeconds;
        if (effectiveWindow == 0) effectiveWindow = 1;
        if (dt < effectiveWindow) {
            return obs.lastSqrtPriceX96;
        }

        uint256 avg = cumulative / uint256(dt);
        if (avg > type(uint160).max) avg = type(uint160).max;
        return uint160(avg);
    }

    function getChainlinkSqrtPriceX96(PoolKey calldata key) external view returns (uint160 sqrtPriceX96, bool ok) {
        PoolOracleConfig memory cfg = poolOracle[key.toId()];
        if (address(cfg.aggregator) == address(0)) return (0, false);

        (, int256 answer,, uint256 updatedAt,) = cfg.aggregator.latestRoundData();
        if (answer <= 0) return (0, false);
        if (block.timestamp - updatedAt > cfg.maxStaleSeconds) return (0, false);

        uint256 price1e18 = _scaleTo1e18(uint256(answer), cfg.aggregatorDecimals);

        if (cfg.token0Decimals > 18) price1e18 = price1e18 / (10 ** (cfg.token0Decimals - 18));
        else if (cfg.token0Decimals < 18) price1e18 = price1e18 * (10 ** (18 - cfg.token0Decimals));

        if (cfg.token1Decimals > 18) price1e18 = price1e18 * (10 ** (cfg.token1Decimals - 18));
        else if (cfg.token1Decimals < 18) price1e18 = price1e18 / (10 ** (18 - cfg.token1Decimals));

        uint256 ratioX192 = Math.mulDiv(price1e18, uint256(1) << 192, 1e18);
        uint256 sqrtRatioX96 = Math.sqrt(ratioX192);
        if (sqrtRatioX96 > type(uint160).max) sqrtRatioX96 = type(uint160).max;
        return (uint160(sqrtRatioX96), true);
    }

    function getPrice1e18(PoolKey calldata key, uint32 twapWindowSeconds) external view returns (uint256 price1e18) {
        (uint160 cl, bool ok) = this.getChainlinkSqrtPriceX96(key);
        uint160 sqrtPriceX96 = ok ? cl : this.getTwapSqrtPriceX96(key, twapWindowSeconds);
        if (sqrtPriceX96 == 0) return 0;
        return Math.mulDiv(uint256(sqrtPriceX96) * uint256(sqrtPriceX96), 1e18, uint256(1) << 192);
    }

    function _scaleTo1e18(uint256 value, uint8 decimals) internal pure returns (uint256) {
        if (decimals == 18) return value;
        if (decimals > 18) return value / (10 ** (decimals - 18));
        return value * (10 ** (18 - decimals));
    }
}
