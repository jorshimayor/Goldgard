// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";

import {PoolManager} from "v4-core/PoolManager.sol";
import {IPoolManager} from "v4-core/interfaces/IPoolManager.sol";
import {PoolKey} from "v4-core/types/PoolKey.sol";
import {Currency} from "v4-core/types/Currency.sol";
import {IHooks} from "v4-core/interfaces/IHooks.sol";
import {ModifyLiquidityParams, SwapParams} from "v4-core/types/PoolOperation.sol";
import {BalanceDelta, toBalanceDelta} from "v4-core/types/BalanceDelta.sol";

import {BaseHook} from "../src/libraries/BaseHook.sol";
import {Transient} from "../src/libraries/Transient.sol";

contract NoopHook is BaseHook {
    constructor(IPoolManager _manager) BaseHook(_manager) {}

    function onlyManagerPing() external view onlyPoolManager returns (uint256) {
        return 1;
    }
}

contract TransientHarness {
    function roundtripU256(bytes32 slot, uint256 v) external returns (uint256) {
        Transient.tstoreU256(slot, v);
        return Transient.tloadU256(slot);
    }

    function roundtripI256(bytes32 slot, int256 v) external returns (int256) {
        Transient.tstoreI256(slot, v);
        return Transient.tloadI256(slot);
    }
}

contract UtilitiesTest is Test {
    function testBaseHookDefaultMethodsRevert() public {
        PoolManager manager = new PoolManager(address(this));
        NoopHook h = new NoopHook(IPoolManager(address(manager)));
        PoolKey memory key = _dummyKey();
        ModifyLiquidityParams memory mlp = ModifyLiquidityParams({
            tickLower: 0,
            tickUpper: 0,
            liquidityDelta: 0,
            salt: bytes32(0)
        });
        SwapParams memory sp = SwapParams({
            zeroForOne: true,
            amountSpecified: 0,
            sqrtPriceLimitX96: 0
        });
        BalanceDelta d = toBalanceDelta(0, 0);

        vm.expectRevert(BaseHook.HookNotImplemented.selector);
        h.beforeInitialize(address(this), key, 0);

        vm.expectRevert(BaseHook.HookNotImplemented.selector);
        h.afterInitialize(address(this), key, 0, 0);

        vm.expectRevert(BaseHook.HookNotImplemented.selector);
        h.beforeAddLiquidity(address(this), key, mlp, new bytes(0));

        vm.expectRevert(BaseHook.HookNotImplemented.selector);
        h.afterAddLiquidity(address(this), key, mlp, d, d, new bytes(0));

        vm.expectRevert(BaseHook.HookNotImplemented.selector);
        h.beforeRemoveLiquidity(address(this), key, mlp, new bytes(0));

        vm.expectRevert(BaseHook.HookNotImplemented.selector);
        h.afterRemoveLiquidity(address(this), key, mlp, d, d, new bytes(0));

        vm.expectRevert(BaseHook.HookNotImplemented.selector);
        h.beforeSwap(address(this), key, sp, new bytes(0));

        vm.expectRevert(BaseHook.HookNotImplemented.selector);
        h.afterSwap(address(this), key, sp, d, new bytes(0));

        vm.expectRevert(BaseHook.HookNotImplemented.selector);
        h.beforeDonate(address(this), key, 0, 0, new bytes(0));

        vm.expectRevert(BaseHook.HookNotImplemented.selector);
        h.afterDonate(address(this), key, 0, 0, new bytes(0));
    }

    function testBaseHookOnlyPoolManagerModifier() public {
        PoolManager manager = new PoolManager(address(this));
        NoopHook h = new NoopHook(IPoolManager(address(manager)));

        vm.expectRevert(BaseHook.OnlyPoolManager.selector);
        h.onlyManagerPing();
    }

    function testTransientRoundtrip() public {
        TransientHarness h = new TransientHarness();
        bytes32 slot = keccak256("t");
        require(h.roundtripU256(slot, 123) == 123);
        require(h.roundtripI256(slot, -123) == -123);
    }

    function _dummyKey() internal pure returns (PoolKey memory) {
        return
            PoolKey({
                currency0: Currency.wrap(address(1)),
                currency1: Currency.wrap(address(2)),
                fee: 3000,
                tickSpacing: 60,
                hooks: IHooks(address(0))
            });
    }
}
