// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";

import {IERC20} from "openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";

import {MockERC20} from "solmate/src/test/utils/mocks/MockERC20.sol";

import {SafetyModule, IGoldgardClaimsView} from "../src/SafetyModule.sol";
import {PoolId} from "v4-core/types/PoolId.sol";

contract MockClaimsView is IGoldgardClaimsView {
    bool public eligible;
    uint256 public payout;

    function setEligible(bool v) external {
        eligible = v;
    }

    function setPayout(uint256 v) external {
        payout = v;
    }

    function isEligible(address, PoolId) external view returns (bool) {
        return eligible;
    }

    function previewClaim(address, PoolId) external view returns (uint256) {
        return payout;
    }
}

contract SafetyModuleTest is Test {
    MockERC20 internal asset;
    SafetyModule internal safety;
    MockClaimsView internal claims;

    address internal hook = address(0xBEEF);
    address internal alice = address(0xA11CE);

    function setUp() public {
        asset = new MockERC20("USDC", "USDC", 18);
        safety = new SafetyModule(
            address(this),
            IERC20(address(asset)),
            "Goldgard Safety Vault",
            "gSAFE"
        );
        claims = new MockClaimsView();

        safety.setHook(hook);
        safety.setClaimsView(IGoldgardClaimsView(address(claims)));
        safety.setCooldownSeconds(0);

        asset.mint(hook, 1_000_000e18);
        vm.prank(hook);
        asset.approve(address(safety), type(uint256).max);
    }

    function testDepositPremiumOnlyHook() public {
        vm.expectRevert(SafetyModule.OnlyHook.selector);
        safety.depositPremium(1e18);
    }

    function testDepositPremiumMintsSharesToVault() public {
        uint256 amount = 10e18;
        vm.prank(hook);
        safety.depositPremium(amount);

        require(safety.totalAssets() == amount);
        require(safety.balanceOf(address(safety)) == amount);
    }

    function testRequestClaimSinglePending() public {
        PoolId poolId = PoolId.wrap(bytes32(uint256(123)));
        vm.prank(alice);
        safety.requestClaim(poolId);

        vm.prank(alice);
        vm.expectRevert(SafetyModule.ClaimPending.selector);
        safety.requestClaim(poolId);
    }

    function testExecuteClaimRespectsPause() public {
        PoolId poolId = PoolId.wrap(bytes32(uint256(123)));
        vm.prank(alice);
        safety.requestClaim(poolId);

        safety.setClaimsPaused(true);

        vm.prank(alice);
        vm.expectRevert(SafetyModule.ClaimsPaused.selector);
        safety.executeClaim(poolId);
    }

    function testExecuteClaimPaysAndClearsRequest() public {
        PoolId poolId = PoolId.wrap(bytes32(uint256(123)));

        vm.prank(hook);
        safety.depositPremium(100e18);

        claims.setEligible(true);
        claims.setPayout(10e18);

        vm.prank(alice);
        safety.requestClaim(poolId);

        uint256 aliceBefore = asset.balanceOf(alice);
        vm.prank(alice);
        uint256 paid = safety.executeClaim(poolId);

        require(paid == 10e18);
        require(asset.balanceOf(alice) == aliceBefore + 10e18);
        require(safety.claimRequestedAt(alice, poolId) == 0);
        require(safety.totalAssets() == 90e18);
    }

    function testExecuteClaimCapsToAvailableAssets() public {
        PoolId poolId = PoolId.wrap(bytes32(uint256(123)));

        vm.prank(hook);
        safety.depositPremium(5e18);

        claims.setEligible(true);
        claims.setPayout(100e18);

        vm.prank(alice);
        safety.requestClaim(poolId);

        vm.prank(alice);
        uint256 paid = safety.executeClaim(poolId);

        require(paid == 5e18);
        require(safety.totalAssets() == 0);
    }

    function testClaimsViewOneTimeSetAndDelayedUpgrade() public {
        SafetyModule fresh = new SafetyModule(
            address(this),
            IERC20(address(asset)),
            "Goldgard Safety Vault",
            "gSAFE"
        );

        fresh.setClaimsView(IGoldgardClaimsView(address(claims)));
        vm.expectRevert(SafetyModule.ClaimsViewAlreadySet.selector);
        fresh.setClaimsView(IGoldgardClaimsView(address(claims)));

        MockClaimsView claims2 = new MockClaimsView();
        fresh.setClaimsViewChangeDelay(1 days);
        fresh.scheduleClaimsViewChange(IGoldgardClaimsView(address(claims2)));

        vm.expectRevert(SafetyModule.ClaimsViewNotReady.selector);
        fresh.acceptClaimsViewChange();

        vm.warp(block.timestamp + 1 days);
        fresh.acceptClaimsViewChange();

        require(address(fresh.claimsView()) == address(claims2));
    }

    function testCancelClaimsViewChangeClearsPending() public {
        SafetyModule fresh = new SafetyModule(
            address(this),
            IERC20(address(asset)),
            "Goldgard Safety Vault",
            "gSAFE"
        );
        fresh.setClaimsView(IGoldgardClaimsView(address(claims)));

        MockClaimsView claims2 = new MockClaimsView();
        fresh.scheduleClaimsViewChange(IGoldgardClaimsView(address(claims2)));
        fresh.cancelClaimsViewChange();

        require(address(fresh.pendingClaimsView()) == address(0));
        require(fresh.pendingClaimsViewValidAt() == 0);
    }
}
