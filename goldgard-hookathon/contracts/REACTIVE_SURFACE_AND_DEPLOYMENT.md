# Goldgard Contracts — Architecture, Reactive Surface, and Deployment Guide

## 1) Architecture Breakdown (Deployed Contracts + Dependencies)

### GoldgardHook (Uniswap v4 Hook)
- Role: Enforces oracle-aware risk controls and premium routing for a Uniswap v4 pool.
- Dependencies:
  - PoolManager (v4-core): calls into the hook for lifecycle callbacks.
  - OracleAdapter: provides Chainlink price (preferred) and TWAP fallback.
  - SafetyModule: receives premium (token1) to fund IL payouts.
  - HedgeReserve: converts token0-premium into token1 and funds hook rebalances.
  - RewardDistributor: mints GGARD rewards proportional to premium deposits.
- Key on-chain behaviors:
  - beforeSwap:
    - Updates oracle observations.
    - Computes spot vs oracle deviation.
    - If deviation exceeds circuitBreakerBps, pauses swaps for cooldown and reverts.
    - Otherwise, applies dynamic LP fee curve when deviation exceeds deviationBps.
  - afterSwap:
    - Takes a premium in the swap “specified token” (as implemented).
    - If premium is token1: deposits directly into SafetyModule.
    - If premium is token0: converts token0→token1 via HedgeReserve and deposits.
    - Optionally accumulates pending flow for later rebalance execution.
  - rebalance:
    - Executes a hook-owned swap via PoolManager.unlock → unlockCallback.
    - Uses HedgeReserve.fundHook to pull the input token into the hook, then swaps.
  - Authorized admin surface (transport-agnostic):
    - setAlertLevel(uint8)
    - setRebalanceThreshold(uint256)
    - setPremiumRate(uint256)
    - All three are gated by authorizedCaller (set to the Callback Receiver).

### OracleAdapter
- Role: Maintains a ring-buffer of pool observations to compute TWAP; reads Chainlink for “external” price.
- Dependency:
  - Chainlink AggregatorV3 (configured per PoolKey).
  - PoolManager: for spot sqrtPrice and observation updates.
- Exposed reads:
  - getChainlinkSqrtPriceX96(key): returns (sqrtPriceX96, ok)
  - getTwapSqrtPriceX96(key, windowSeconds)
  - getPrice1e18(key, twapWindowSeconds)
  - getPrice1e18Strict(key): requires a valid Chainlink value

### HedgeReserve
- Role: Holds liquidity buffers for conversions and rebalances.
- Dependencies:
  - OracleAdapter: strict Chainlink pricing for conversions.
  - PoolManager: spot price for “spot vs oracle deviation” safety check.
- Key behavior:
  - convertToken0ToToken1 / convertToken1ToToken0:
    - Requires caller == hook.
    - Uses Chainlink strict price and checks spot/oracle deviation against maxSpotOracleDeviationBps.
    - Transfers in input token; transfers out output token.
  - fundHook(currency, amount, to):
    - Requires caller == hook.
    - Transfers currency to hook to prepare unlockCallback swap.

### SafetyModule (ERC-4626 vault)
- Role: Holds token1-denominated reserves for IL payouts.
- Dependencies:
  - GoldgardHook: only hook can depositPremium().
  - ClaimsView: set to GoldgardHook so eligibility and payout previews are derived from hook position accounting.
- Key behavior:
  - depositPremium(amount): only hook; deposits assets into the vault itself.
  - requestClaim(poolId) / executeClaim(poolId):
    - Enforces cooldown and optional pause.
    - Requires eligibility via claimsView.
    - Withdraws up to available assets (caps payout to vault balance).
  - Authorized admin surface (transport-agnostic):
    - epochCheckpoint(): rolls accumulators and emits a daily summary event (gated by authorizedCaller).

### RewardDistributor (ERC-6909)
- Role: Mints GGARD reward token id=1 on demand.
- Dependency:
  - GoldgardHook: only hook can mintReward(to, amount).

### GoldgardCallbackReceiver (Sepolia adapter)
- Role: Single Sepolia entrypoint for Reactive callbacks (trust boundary).
- Trust model:
  - Checks msg.sender == reactiveCallbackProxy (Reactive Network’s published Sepolia callback proxy address).
  - Forwards into core contracts’ authorized admin surface.
- Dependencies:
  - GoldgardHook: setAlertLevel / setRebalanceThreshold / setPremiumRate
  - SafetyModule: epochCheckpoint

## 2) Cross-Contract Interaction Flows (Including Lasna Reactive Surface)

### Flow A — Normal swap protection + premium routing
1. User swaps via SwapRouterNoChecks → PoolManager.swap.
2. PoolManager calls GoldgardHook.beforeSwap:
   - OracleAdapter.updateFromPool(manager, key)
   - Reads spot and Chainlink/TWAP oracle prices
   - Applies circuit breaker and dynamic LP fee override
3. PoolManager executes swap with overridden fee.
4. PoolManager calls GoldgardHook.afterSwap:
   - Takes a premium and routes it:
     - token1 → SafetyModule.depositPremium
     - token0 → HedgeReserve.convertToken0ToToken1 → SafetyModule.depositPremium
   - Mints GGARD rewards to swap sender.

### Flow B — Rebalance (hook-driven)
1. A swap accumulates pendingToken{0,1}In if rebalanceBps is non-zero.
2. Anyone calls GoldgardHook.rebalance(key, zeroForOne, maxAmountIn).
3. Hook calls PoolManager.unlock(abi.encode(key, zeroForOne, amountIn)).
4. PoolManager calls GoldgardHook.unlockCallback:
   - HedgeReserve.fundHook(currencyIn, amountIn, hook)
   - Hook calls PoolManager.swap from inside unlockCallback
   - Hook settles/takes tokens and returns funds to HedgeReserve

### Flow C — Lasna Reactive surface (two-tier pattern)
Reactive callbacks land on GoldgardCallbackReceiver (Sepolia), which checks msg.sender against the Reactive callback proxy address, then forwards into the core protocol’s transport-agnostic authorized surface.

Tier 1: Reactive callback proxy → GoldgardCallbackReceiver
- handleAlertLevel(uint8 level) → GoldgardHook.setAlertLevel(level)
- handleTightenThreshold(uint256 newThreshold) → GoldgardHook.setRebalanceThreshold(newThreshold)
- handleAdjustPremiumRate(uint256 newRateBps) → GoldgardHook.setPremiumRate(newRateBps)
- handleEpochCheckpoint() → SafetyModule.epochCheckpoint()

Tier 2: GoldgardCallbackReceiver → core contracts
- GoldgardHook and SafetyModule gate their admin surface by authorizedCaller == GoldgardCallbackReceiver.

Event subscriptions (Sepolia → Lasna inference triggers):
- OracleAdapter.OraclePriceUpdated(twap, external_, deviationBps, timestamp)
  - Intended watcher trigger for early oracle divergence detection.
- GoldgardHook.PremiumDiverted(...)
  - Intended watcher input for premium inflow.
- SafetyModule.ClaimPaid(lp, amount, reservePostBalance)
  - Intended watcher input for payout outflow.
- HedgeReserve.ReserveBalanceChanged(newBalance, delta, triggeredBy)
  - Intended watcher input for reserve depletion.

## 3) Local Anvil Guide (Terminal-first)

### Prereqs
- Foundry installed
- From this folder: `goldgard-hookathon/contracts`

### Start Anvil
```bash
anvil
```

### Deploy the full stack locally and write frontend config
```bash
export REACTIVE_CALLBACK_PROXY=0x000000000000000000000000000000000000dEaD
forge script script/DeployDemo.s.sol:DeployDemo --rpc-url http://127.0.0.1:8545 --broadcast
```

Outputs:
- Writes `../frontend/app/config/demoConfig.local.json` with fresh addresses.

### Verify reactive integration is configured
Use cast against the deployed addresses from `demoConfig.local.json`:
```bash
cast call <HOOK_ADDRESS> "authorizedCaller()(address)" --rpc-url http://127.0.0.1:8545
cast call <SAFETY_ADDRESS> "authorizedCaller()(address)" --rpc-url http://127.0.0.1:8545
```

### Manually trigger the reactive alert (local “simulation”)
If you set `REACTIVE_CALLBACK_PROXY` to an address you control, send from that address:
```bash
cast send <CALLBACK_RECEIVER_ADDRESS> "handleAlertLevel(uint8)" 1 --rpc-url http://127.0.0.1:8545 --private-key <PK_OF_PROXY>
```

### Local debugging workflow
- Re-run the deploy script whenever state becomes inconsistent.
- Use `forge test` and `forge test -vvvv` for detailed traces.

## 4) Sepolia Guide (Deploy + Etherscan interaction)

### Deploy to Sepolia
```bash
export PRIVATE_KEY=<YOUR_SEPOLIA_DEPLOYER_PK>
export REACTIVE_CALLBACK_PROXY=<REACTIVE_SEPOLIA_CALLBACK_PROXY>
forge script script/DeployDemo.s.sol:DeployDemo --rpc-url <SEPOLIA_RPC_URL> --broadcast --verify
```

Outputs:
- Writes `../frontend/app/config/demoConfig.sepolia.json` with deployed addresses.

### Interact via Etherscan
1. Open the contract address on Sepolia Etherscan.
2. Use “Contract → Read Contract” for view functions.
3. Use “Contract → Write Contract” and connect a wallet to submit transactions.

High-signal reads:
- GoldgardHook:
  - getReactiveAlert()
  - premiumBps()
  - minRebalanceAmountIn()
- OracleAdapter:
  - getPrice1e18(...)
  - getPrice1e18Strict(...)
- SafetyModule:
  - totalAssets()
  - epochId(), epochPremiumIn(), epochPayoutOut()

## 5) Demo Walkthrough (Presentation Script)

### Demo 1 — “Early warning” rune
Expected outcome: dashboard shows a glowing rune when alert is active.
1. Trigger `GoldgardCallbackReceiver.handleAlertLevel(1)` from the Reactive callback proxy.
2. Refresh dashboard: rune becomes active, “Pre-warmed” status shows.

### Demo 2 — “Actuarial loop”
Expected outcome: epoch checkpoint emits summary and resets counters.
1. Generate premium via swaps (or call depositPremium via hook path).
2. Execute at least one claim.
3. Trigger `GoldgardCallbackReceiver.handleEpochCheckpoint()` from callback proxy.
4. Verify `epochPremiumIn` and `epochPayoutOut` reset to 0.

### Demo 3 — “Reserve depletion guardrail”
Expected outcome: watcher tightens rebalance threshold; small rebalances no-op.
1. Trigger `GoldgardCallbackReceiver.handleTightenThreshold(highValue)`.
2. Attempt a rebalance with pending < threshold.
3. Confirm `rebalance(...)` returns 0 and pending remains.
