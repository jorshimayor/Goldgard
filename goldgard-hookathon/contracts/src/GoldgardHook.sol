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
import {SafeCast} from "v4-core/libraries/SafeCast.sol";
import {
    SafeCast as OZSafeCast
} from "openzeppelin-contracts/contracts/utils/math/SafeCast.sol";

import {Hooks} from "v4-core/libraries/Hooks.sol";
import {IHooks} from "v4-core/interfaces/IHooks.sol";
import {PoolKey} from "v4-core/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "v4-core/types/PoolId.sol";
import {
    BalanceDelta,
    BalanceDeltaLibrary,
    toBalanceDelta
} from "v4-core/types/BalanceDelta.sol";
import {
    BeforeSwapDelta,
    BeforeSwapDeltaLibrary
} from "v4-core/types/BeforeSwapDelta.sol";
import {Currency} from "v4-core/types/Currency.sol";
import {IPoolManager} from "v4-core/interfaces/IPoolManager.sol";
import {IUnlockCallback} from "v4-core/interfaces/callback/IUnlockCallback.sol";
import {
    ModifyLiquidityParams,
    SwapParams
} from "v4-core/types/PoolOperation.sol";
import {StateLibrary} from "v4-core/libraries/StateLibrary.sol";
import {TickMath} from "v4-core/libraries/TickMath.sol";
import {LPFeeLibrary} from "v4-core/libraries/LPFeeLibrary.sol";

import {BaseHook} from "./libraries/BaseHook.sol";
import {Transient} from "./libraries/Transient.sol";
import {OracleAdapter} from "./OracleAdapter.sol";
import {SafetyModule} from "./SafetyModule.sol";
import {HedgeReserve} from "./HedgeReserve.sol";
import {RewardDistributor} from "./RewardDistributor.sol";

contract GoldgardHook is BaseHook, Ownable2Step, IUnlockCallback {
    using Hooks for IHooks;
    using PoolIdLibrary for PoolKey;
    using BalanceDeltaLibrary for BalanceDelta;
    using LPFeeLibrary for uint24;
    using SafeERC20 for IERC20;
    using SafeCast for uint256;
    using SafeCast for int256;
    using StateLibrary for IPoolManager;

    error CircuitBreakerActive();
    error OracleUnavailable();
    error OracleDeviationTooHigh(uint256 deviationBps);
    error InvalidFee(uint24 fee);

    event CircuitBreakerTripped(
        PoolId indexed poolId,
        uint64 until,
        uint256 deviationBps
    );
    event PremiumTaken(
        PoolId indexed poolId,
        Currency feeCurrency,
        uint256 feeAmount,
        uint256 usdcDeposited
    );
    event Rebalanced(
        PoolId indexed poolId,
        int256 poolDelta0,
        int256 poolDelta1,
        uint256 amountMoved
    );
    event RebalanceExecuted(
        PoolId indexed poolId,
        bool zeroForOne,
        uint256 amountIn,
        uint256 amountOut
    );
    event LiquidityEnrolled(
        PoolId indexed poolId,
        bytes32 indexed positionKey,
        address indexed owner,
        uint128 liquidity
    );

    uint256 public constant BPS = 10_000;
    uint256 public constant PREMIUM_BPS = 2;

    bytes32 internal constant TS_REBALANCE_IN_PROGRESS =
        keccak256("GGARD/rebalance/inProgress");
    bytes32 internal constant TS_REBALANCE_AMOUNT_IN =
        keccak256("GGARD/rebalance/amountIn");
    bytes32 internal constant TS_REBALANCE_AMOUNT_OUT =
        keccak256("GGARD/rebalance/amountOut");

    struct PoolConfig {
        uint24 baseLpFee;
        uint24 maxLpFee;
        uint16 feeSlopeBps;
        uint16 deviationBps;
        uint16 circuitBreakerBps;
        uint16 rebalanceBps;
        uint32 twapWindowSeconds;
        uint32 circuitBreakerCooldownSeconds;
        uint64 pausedUntil;
    }

    struct PositionInfo {
        uint128 liquidity;
        uint64 lastTimestamp;
        uint256 totalLiquiditySeconds;
        uint256 inRangeLiquiditySeconds;
        uint256 principalToken1;
        uint160 enrolledSqrtPriceX96;
        int24 tickLower;
        int24 tickUpper;
    }

    OracleAdapter public immutable oracle;
    SafetyModule public immutable safetyModule;
    HedgeReserve public immutable hedgeReserve;
    RewardDistributor public immutable rewards;

    mapping(PoolId => PoolConfig) public poolConfig;
    mapping(PoolId => PoolKey) public poolKeys;
    mapping(bytes32 => PositionInfo) public positions;
    mapping(PoolId => uint256) public pendingToken0In;
    mapping(PoolId => uint256) public pendingToken1In;

    constructor(
        address _owner,
        IPoolManager _manager,
        OracleAdapter _oracle,
        SafetyModule _safetyModule,
        HedgeReserve _hedgeReserve,
        RewardDistributor _rewards
    ) BaseHook(_manager) Ownable(_owner) {
        oracle = _oracle;
        safetyModule = _safetyModule;
        hedgeReserve = _hedgeReserve;
        rewards = _rewards;

        Hooks.Permissions memory perms;
        perms.afterAddLiquidity = true;
        perms.afterRemoveLiquidity = true;
        perms.beforeSwap = true;
        perms.afterSwap = true;
        perms.afterSwapReturnDelta = true;
        perms.afterAddLiquidityReturnDelta = false;
        perms.afterRemoveLiquidityReturnDelta = false;
        Hooks.validateHookPermissions(this, perms);
    }

    function setPoolConfig(
        PoolKey calldata key,
        PoolConfig calldata cfg
    ) external onlyOwner {
        if (cfg.maxLpFee < cfg.baseLpFee) revert InvalidFee(cfg.maxLpFee);
        if (cfg.rebalanceBps > BPS) revert InvalidFee(uint24(cfg.rebalanceBps));
        poolConfig[key.toId()] = cfg;
        poolKeys[key.toId()] = key;
    }

    function beforeSwap(
        address,
        PoolKey calldata key,
        SwapParams calldata,
        bytes calldata
    )
        external
        override
        onlyPoolManager
        returns (bytes4, BeforeSwapDelta, uint24)
    {
        PoolId poolId = key.toId();
        PoolConfig storage cfg = poolConfig[poolId];
        if (cfg.pausedUntil != 0 && block.timestamp < cfg.pausedUntil)
            revert CircuitBreakerActive();

        oracle.updateFromPool(manager, key);

        (uint160 spotSqrtPriceX96, , , ) = manager.getSlot0(poolId);
        (uint160 oracleSqrtPriceX96, bool ok) = oracle.getChainlinkSqrtPriceX96(
            key
        );
        if (!ok) {
            oracleSqrtPriceX96 = oracle.getTwapSqrtPriceX96(
                key,
                cfg.twapWindowSeconds
            );
        }
        if (oracleSqrtPriceX96 == 0) revert OracleUnavailable();

        uint256 deviationBps = _deviationBps(
            spotSqrtPriceX96,
            oracleSqrtPriceX96
        );

        if (deviationBps > cfg.circuitBreakerBps) {
            uint64 until = uint64(
                block.timestamp + cfg.circuitBreakerCooldownSeconds
            );
            cfg.pausedUntil = until;
            emit CircuitBreakerTripped(poolId, until, deviationBps);
            revert OracleDeviationTooHigh(deviationBps);
        }

        uint24 dynFee = cfg.baseLpFee;
        if (deviationBps > cfg.deviationBps) {
            uint256 extra = (deviationBps - cfg.deviationBps) *
                uint256(cfg.feeSlopeBps);
            uint256 candidate = uint256(cfg.baseLpFee) + extra;
            if (candidate > cfg.maxLpFee) candidate = cfg.maxLpFee;
            dynFee = OZSafeCast.toUint24(candidate);
        }

        uint24 overrideFee = dynFee | LPFeeLibrary.OVERRIDE_FEE_FLAG;
        return (
            GoldgardHook.beforeSwap.selector,
            BeforeSwapDeltaLibrary.ZERO_DELTA,
            overrideFee
        );
    }

    function afterSwap(
        address sender,
        PoolKey calldata key,
        SwapParams calldata params,
        BalanceDelta delta,
        bytes calldata
    ) external override onlyPoolManager returns (bytes4, int128) {
        if (Transient.tloadU256(TS_REBALANCE_IN_PROGRESS) == 1)
            return (GoldgardHook.afterSwap.selector, 0);

        PoolId poolId = key.toId();
        PoolConfig memory cfg = poolConfig[poolId];

        bool specifiedTokenIs0 = (params.amountSpecified < 0 ==
            params.zeroForOne);
        (Currency feeCurrency, int128 swapAmount) = (specifiedTokenIs0)
            ? (key.currency1, delta.amount1())
            : (key.currency0, delta.amount0());

        if (swapAmount < 0) swapAmount = -swapAmount;
        uint256 swapAmountAbs = OZSafeCast.toUint256(int256(swapAmount));
        uint256 premium = (swapAmountAbs * PREMIUM_BPS) / BPS;
        if (premium == 0) return (GoldgardHook.afterSwap.selector, 0);

        manager.take(feeCurrency, address(this), premium);

        uint256 usdcDeposited;
        if (feeCurrency == key.currency1) {
            IERC20(Currency.unwrap(key.currency1)).approve(
                address(safetyModule),
                premium
            );
            safetyModule.depositPremium(premium);
            usdcDeposited = premium;
        } else {
            IERC20(Currency.unwrap(key.currency0)).approve(
                address(hedgeReserve),
                premium
            );
            uint256 converted = hedgeReserve.convertToken0ToToken1(
                key,
                premium,
                cfg.twapWindowSeconds
            );
            IERC20(Currency.unwrap(key.currency1)).approve(
                address(safetyModule),
                converted
            );
            safetyModule.depositPremium(converted);
            usdcDeposited = converted;
        }

        if (cfg.rebalanceBps != 0) {
            int256 poolDelta0 = -int256(delta.amount0());
            int256 poolDelta1 = -int256(delta.amount1());

            if (poolDelta0 > 0) {
                uint256 amount0In =
                    (OZSafeCast.toUint256(poolDelta0) * cfg.rebalanceBps) / BPS;
                pendingToken0In[poolId] += amount0In;
            } else if (poolDelta1 > 0) {
                uint256 amount1In =
                    (OZSafeCast.toUint256(poolDelta1) * cfg.rebalanceBps) / BPS;
                pendingToken1In[poolId] += amount1In;
            }
        }

        uint256 reward = usdcDeposited / 100;
        if (reward > 0) rewards.mintReward(sender, reward);

        emit PremiumTaken(poolId, feeCurrency, premium, usdcDeposited);
        return (GoldgardHook.afterSwap.selector, premium.toInt128());
    }

    function afterAddLiquidity(
        address sender,
        PoolKey calldata key,
        ModifyLiquidityParams calldata params,
        BalanceDelta delta,
        BalanceDelta,
        bytes calldata hookData
    ) external override onlyPoolManager returns (bytes4, BalanceDelta) {
        if (params.liquidityDelta <= 0) {
            return (
                GoldgardHook.afterAddLiquidity.selector,
                toBalanceDelta(0, 0)
            );
        }

        address owner = _resolveOwner(sender, hookData);
        PoolId poolId = key.toId();
        bytes32 positionKey = keccak256(
            abi.encode(
                poolId,
                owner,
                params.tickLower,
                params.tickUpper,
                params.salt
            )
        );

        PositionInfo storage p = positions[positionKey];

        (, int24 tick, , ) = manager.getSlot0(poolId);

        _updatePositionAccrual(p, tick);
        p.tickLower = params.tickLower;
        p.tickUpper = params.tickUpper;

        uint128 added = uint256(params.liquidityDelta).toUint128();
        p.liquidity += added;

        uint256 amount0 = delta.amount0() < 0
            ? OZSafeCast.toUint256(int256(-delta.amount0()))
            : 0;
        uint256 amount1 = delta.amount1() < 0
            ? OZSafeCast.toUint256(int256(-delta.amount1()))
            : 0;

        uint256 price1e18 = oracle.getPrice1e18Strict(key);
        uint256 token0ValueIn1 = Math.mulDiv(amount0, price1e18, 1e18);
        uint256 principalAdded = amount1 + token0ValueIn1;

        if (p.enrolledSqrtPriceX96 == 0) {
            (uint160 clSqrtPriceX96, bool ok) = oracle.getChainlinkSqrtPriceX96(
                key
            );
            if (!ok || clSqrtPriceX96 == 0) revert OracleUnavailable();
            p.enrolledSqrtPriceX96 = clSqrtPriceX96;
            emit LiquidityEnrolled(poolId, positionKey, owner, p.liquidity);
        }
        p.principalToken1 += principalAdded;

        return (GoldgardHook.afterAddLiquidity.selector, toBalanceDelta(0, 0));
    }

    function afterRemoveLiquidity(
        address sender,
        PoolKey calldata key,
        ModifyLiquidityParams calldata params,
        BalanceDelta,
        BalanceDelta,
        bytes calldata hookData
    ) external override onlyPoolManager returns (bytes4, BalanceDelta) {
        if (params.liquidityDelta >= 0) {
            return (
                GoldgardHook.afterRemoveLiquidity.selector,
                toBalanceDelta(0, 0)
            );
        }

        address owner = _resolveOwner(sender, hookData);
        PoolId poolId = key.toId();
        bytes32 positionKey = keccak256(
            abi.encode(
                poolId,
                owner,
                params.tickLower,
                params.tickUpper,
                params.salt
            )
        );

        PositionInfo storage p = positions[positionKey];
        if (p.liquidity == 0) {
            return (
                GoldgardHook.afterRemoveLiquidity.selector,
                toBalanceDelta(0, 0)
            );
        }

        (, int24 tick, , ) = manager.getSlot0(poolId);
        _updatePositionAccrual(p, tick);

        uint128 removed = uint256(-params.liquidityDelta).toUint128();
        if (removed > p.liquidity) removed = p.liquidity;

        uint128 prevLiquidity = p.liquidity;
        p.liquidity = prevLiquidity - removed;

        if (p.principalToken1 != 0) {
            p.principalToken1 = Math.mulDiv(
                p.principalToken1,
                uint256(p.liquidity),
                uint256(prevLiquidity)
            );
        }

        if (p.liquidity == 0) {
            delete positions[positionKey];
        }

        return (GoldgardHook.afterRemoveLiquidity.selector, toBalanceDelta(0, 0));
    }

    function isEligible(
        address account,
        PoolId poolId
    ) external view returns (bool) {
        bytes32 k = _anyPositionKey(poolId, account);
        PositionInfo memory p = positions[k];
        if (p.liquidity == 0) return false;

        uint256 total = p.totalLiquiditySeconds;
        uint256 inRange = p.inRangeLiquiditySeconds;
        if (p.lastTimestamp != 0 && block.timestamp > p.lastTimestamp) {
            (, int24 tick, , ) = manager.getSlot0(poolId);
            uint256 dt = block.timestamp - uint256(p.lastTimestamp);
            uint256 liqSeconds = uint256(p.liquidity) * dt;
            total += liqSeconds;
            if (tick >= p.tickLower && tick < p.tickUpper)
                inRange += liqSeconds;
        }

        if (total == 0) return true;
        return inRange * 100 >= total * 80;
    }

    function previewClaim(
        address account,
        PoolId poolId
    ) external view returns (uint256 payoutAssets) {
        bytes32 k = _anyPositionKey(poolId, account);
        PositionInfo memory p = positions[k];
        if (p.enrolledSqrtPriceX96 == 0 || p.principalToken1 == 0) return 0;

        uint256 p0 = Math.mulDiv(
            Math.mulDiv(
                uint256(p.enrolledSqrtPriceX96),
                uint256(p.enrolledSqrtPriceX96),
                uint256(1) << 192
            ),
            1e18,
            1
        );
        PoolKey memory key = poolKeys[poolId];
        uint256 current = oracle.getPrice1e18Strict(key);
        if (current == 0 || p0 == 0) return 0;
        uint256 r = Math.mulDiv(current, 1e18, p0);

        uint256 ilBps = _impermanentLossBps(r);
        payoutAssets = Math.mulDiv(p.principalToken1, ilBps, BPS);

        uint256 available = IERC20(address(safetyModule.asset())).balanceOf(
            address(safetyModule)
        );
        if (payoutAssets > available) payoutAssets = available;
    }

    function rebalance(
        PoolKey calldata key,
        bool zeroForOne,
        uint256 maxAmountIn
    ) external returns (uint256 amountOut) {
        PoolId poolId = key.toId();
        PoolConfig memory cfg = poolConfig[poolId];
        if (cfg.rebalanceBps == 0) return 0;

        uint256 pending = zeroForOne
            ? pendingToken0In[poolId]
            : pendingToken1In[poolId];
        uint256 amountIn = pending;
        if (maxAmountIn != 0 && amountIn > maxAmountIn) amountIn = maxAmountIn;
        if (amountIn == 0) return 0;

        bytes memory ret = manager.unlock(abi.encode(key, zeroForOne, amountIn));
        amountOut = abi.decode(ret, (uint256));

        if (zeroForOne) pendingToken0In[poolId] -= amountIn;
        else pendingToken1In[poolId] -= amountIn;

        emit RebalanceExecuted(poolId, zeroForOne, amountIn, amountOut);
    }

    function unlockCallback(
        bytes calldata data
    ) external override onlyPoolManager returns (bytes memory) {
        (PoolKey memory key, bool zeroForOne, uint256 amountIn) = abi.decode(
            data,
            (PoolKey, bool, uint256)
        );

        Transient.tstoreU256(TS_REBALANCE_IN_PROGRESS, 1);
        Transient.tstoreU256(TS_REBALANCE_AMOUNT_IN, amountIn);
        Transient.tstoreU256(TS_REBALANCE_AMOUNT_OUT, 0);

        hedgeReserve.fundHook(
            zeroForOne ? key.currency0 : key.currency1,
            amountIn,
            address(this)
        );
        uint256 amountOut = _rebalanceSwap(key, zeroForOne, amountIn);

        Transient.tstoreU256(TS_REBALANCE_AMOUNT_OUT, amountOut);
        Transient.tstoreU256(TS_REBALANCE_IN_PROGRESS, 0);

        return abi.encode(amountOut);
    }

    function _rebalanceSwap(
        PoolKey memory key,
        bool zeroForOne,
        uint256 amountIn
    ) internal returns (uint256 amountOut) {
        SwapParams memory p = SwapParams({
            zeroForOne: zeroForOne,
            amountSpecified: -amountIn.toInt256(),
            sqrtPriceLimitX96: zeroForOne
                ? TickMath.MIN_SQRT_PRICE + 1
                : TickMath.MAX_SQRT_PRICE - 1
        });

        BalanceDelta d = manager.swap(key, p, new bytes(0));

        if (zeroForOne) {
            uint256 in0 = OZSafeCast.toUint256(int256(-d.amount0()));
            amountOut = OZSafeCast.toUint256(int256(d.amount1()));

            manager.sync(key.currency0);
            IERC20(Currency.unwrap(key.currency0)).safeTransfer(
                address(manager),
                in0
            );
            manager.settle();

            manager.take(key.currency1, address(this), amountOut);
            IERC20(Currency.unwrap(key.currency1)).safeTransfer(
                address(hedgeReserve),
                amountOut
            );
        } else {
            uint256 in1 = OZSafeCast.toUint256(int256(-d.amount1()));
            amountOut = OZSafeCast.toUint256(int256(d.amount0()));

            manager.sync(key.currency1);
            IERC20(Currency.unwrap(key.currency1)).safeTransfer(
                address(manager),
                in1
            );
            manager.settle();

            manager.take(key.currency0, address(this), amountOut);
            IERC20(Currency.unwrap(key.currency0)).safeTransfer(
                address(hedgeReserve),
                amountOut
            );
        }
    }

    function _resolveOwner(
        address sender,
        bytes calldata hookData
    ) internal pure returns (address) {
        if (hookData.length == 20) {
            address owner;
            assembly ("memory-safe") {
                owner := shr(96, calldataload(hookData.offset))
            }
            return owner;
        }
        return sender;
    }

    function _updatePositionAccrual(
        PositionInfo storage p,
        int24 currentTick
    ) internal {
        uint64 t = uint64(block.timestamp);
        if (p.lastTimestamp == 0) {
            p.lastTimestamp = t;
            return;
        }
        uint64 dt = t - p.lastTimestamp;
        if (dt == 0 || p.liquidity == 0) {
            p.lastTimestamp = t;
            return;
        }
        uint256 liqSeconds = uint256(p.liquidity) * uint256(dt);
        p.totalLiquiditySeconds += liqSeconds;

        bool inRange = currentTick >= p.tickLower && currentTick < p.tickUpper;
        if (inRange) p.inRangeLiquiditySeconds += liqSeconds;

        p.lastTimestamp = t;
    }

    function _deviationBps(
        uint160 spot,
        uint160 oracleSqrt
    ) internal pure returns (uint256) {
        uint256 a = uint256(spot);
        uint256 b = uint256(oracleSqrt);
        if (a == b) return 0;
        uint256 hi = a > b ? a : b;
        uint256 lo = a > b ? b : a;
        return ((hi - lo) * BPS) / lo;
    }

    function _impermanentLossBps(
        uint256 priceRatio1e18
    ) internal pure returns (uint256) {
        if (priceRatio1e18 == 0) return 0;
        uint256 sqrtR1e18 = Math.sqrt(priceRatio1e18 * 1e18);
        uint256 factor1e18 = Math.mulDiv(
            2 * sqrtR1e18,
            1e18,
            1e18 + priceRatio1e18
        );
        if (factor1e18 >= 1e18) return 0;
        return Math.mulDiv(1e18 - factor1e18, BPS, 1e18);
    }

    function _anyPositionKey(
        PoolId poolId,
        address account
    ) internal view returns (bytes32) {
        PoolKey memory key = poolKeys[poolId];
        int24 lower = TickMath.minUsableTick(key.tickSpacing);
        int24 upper = TickMath.maxUsableTick(key.tickSpacing);
        return keccak256(abi.encode(poolId, account, lower, upper, bytes32(0)));
    }
}
