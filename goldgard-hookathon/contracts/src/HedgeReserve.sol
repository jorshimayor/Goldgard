// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "openzeppelin-contracts/contracts/access/Ownable.sol";
import {
    Ownable2Step
} from "openzeppelin-contracts/contracts/access/Ownable2Step.sol";
import {Math} from "openzeppelin-contracts/contracts/utils/math/Math.sol";
import {IERC20} from "openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";
import {
    SafeERC20
} from "openzeppelin-contracts/contracts/token/ERC20/utils/SafeERC20.sol";

import {Currency} from "v4-core/types/Currency.sol";
import {PoolKey} from "v4-core/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "v4-core/types/PoolId.sol";
import {IPoolManager} from "v4-core/interfaces/IPoolManager.sol";
import {StateLibrary} from "v4-core/libraries/StateLibrary.sol";

import {OracleAdapter} from "./OracleAdapter.sol";

contract HedgeReserve is Ownable2Step {
    using SafeERC20 for IERC20;
    using PoolIdLibrary for PoolKey;
    using StateLibrary for IPoolManager;

    error BadConfig();
    error OnlyHook();
    error InsufficientLiquidity();
    error OracleDeviationTooHigh(uint256 deviationBps);

    address public hook;
    OracleAdapter public immutable oracle;
    IPoolManager public immutable manager;
    uint16 public maxSpotOracleDeviationBps;

    constructor(
        address _owner,
        IPoolManager _manager,
        OracleAdapter _oracle
    ) Ownable(_owner) {
        manager = _manager;
        oracle = _oracle;
        maxSpotOracleDeviationBps = 200;
    }

    function setHook(address _hook) external onlyOwner {
        hook = _hook;
    }

    function setMaxSpotOracleDeviationBps(
        uint16 deviationBps
    ) external onlyOwner {
        if (deviationBps > 10_000) revert BadConfig();
        maxSpotOracleDeviationBps = deviationBps;
    }

    function fundHook(Currency currency, uint256 amount, address to) external {
        if (msg.sender != hook) revert OnlyHook();
        IERC20(Currency.unwrap(currency)).safeTransfer(to, amount);
    }

    function convertToken0ToToken1(
        PoolKey calldata key,
        uint256 amount0In,
        uint32
    ) external returns (uint256 amount1Out) {
        if (msg.sender != hook) revert OnlyHook();

        uint256 p = oracle.getPrice1e18Strict(key);
        _checkSpotDeviation(key, p);
        amount1Out = Math.mulDiv(amount0In, p, 1e18);

        IERC20(Currency.unwrap(key.currency0)).safeTransferFrom(
            msg.sender,
            address(this),
            amount0In
        );
        if (key.currency1.balanceOfSelf() < amount1Out)
            revert InsufficientLiquidity();
        key.currency1.transfer(msg.sender, amount1Out);
    }

    function convertToken1ToToken0(
        PoolKey calldata key,
        uint256 amount1In,
        uint32
    ) external returns (uint256 amount0Out) {
        if (msg.sender != hook) revert OnlyHook();

        uint256 p = oracle.getPrice1e18Strict(key);
        _checkSpotDeviation(key, p);
        amount0Out = Math.mulDiv(amount1In, 1e18, p);

        IERC20(Currency.unwrap(key.currency1)).safeTransferFrom(
            msg.sender,
            address(this),
            amount1In
        );
        if (key.currency0.balanceOfSelf() < amount0Out)
            revert InsufficientLiquidity();
        key.currency0.transfer(msg.sender, amount0Out);
    }

    function rebalanceExactToken1Out(
        IPoolManager,
        PoolKey calldata,
        uint256,
        uint256
    ) external pure {
        revert("deprecated");
    }

    function rebalanceExactToken0Out(
        IPoolManager,
        PoolKey calldata,
        uint256,
        uint256
    ) external pure {
        revert("deprecated");
    }

    function _checkSpotDeviation(PoolKey calldata key, uint256 oraclePrice1e18) internal view {
        PoolId poolId = key.toId();
        (uint160 spotSqrtPriceX96, , , ) = manager.getSlot0(poolId);
        uint256 spot = _price1e18FromSqrt(spotSqrtPriceX96);
        uint256 deviation = _deviationBps(spot, oraclePrice1e18);
        if (deviation > uint256(maxSpotOracleDeviationBps))
            revert OracleDeviationTooHigh(deviation);
    }

    function _price1e18FromSqrt(
        uint160 sqrtPriceX96
    ) internal pure returns (uint256) {
        uint256 price = Math.mulDiv(
            uint256(sqrtPriceX96),
            uint256(sqrtPriceX96),
            uint256(1) << 192
        );
        return Math.mulDiv(price, 1e18, 1);
    }

    function _deviationBps(
        uint256 a,
        uint256 b
    ) internal pure returns (uint256) {
        if (a == b) return 0;
        uint256 hi = a > b ? a : b;
        uint256 lo = a > b ? b : a;
        if (lo == 0) return type(uint256).max;
        return ((hi - lo) * 10_000) / lo;
    }
}
