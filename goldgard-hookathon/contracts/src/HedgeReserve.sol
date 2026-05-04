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
import {IPoolManager} from "v4-core/interfaces/IPoolManager.sol";

import {OracleAdapter} from "./OracleAdapter.sol";

contract HedgeReserve is Ownable2Step {
    using SafeERC20 for IERC20;

    error OnlyHook();
    error InsufficientLiquidity();

    address public hook;
    OracleAdapter public immutable oracle;

    constructor(address _owner, OracleAdapter _oracle) Ownable(_owner) {
        oracle = _oracle;
    }

    function setHook(address _hook) external onlyOwner {
        hook = _hook;
    }

    function fundHook(Currency currency, uint256 amount, address to) external {
        if (msg.sender != hook) revert OnlyHook();
        IERC20(Currency.unwrap(currency)).safeTransfer(to, amount);
    }

    function convertToken0ToToken1(
        PoolKey calldata key,
        uint256 amount0In,
        uint32 twapWindowSeconds
    ) external returns (uint256 amount1Out) {
        if (msg.sender != hook) revert OnlyHook();

        uint256 p = oracle.getPrice1e18(key, twapWindowSeconds);
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
        uint32 twapWindowSeconds
    ) external returns (uint256 amount0Out) {
        if (msg.sender != hook) revert OnlyHook();

        uint256 p = oracle.getPrice1e18(key, twapWindowSeconds);
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
}
