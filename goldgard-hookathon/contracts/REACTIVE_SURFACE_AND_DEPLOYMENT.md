# Goldgard Contracts — Architecture, Reactive Surface, and Deployment Guide

## 1) Architecture Breakdown (Deployed Contracts + Dependencies)

### GoldgardHook (Uniswap v4 Hook)
- Role: Enforces oracle-aware risk controls and premium routing for a Uniswap v4 pool.
- Dependencies:
  - PoolManager (v4-core): calls into the hook for lifecycle callbacks.
  - OracleAdapter: provides a live-safe reference price that prefers fresh Chainlink and falls back to fresh pool TWAP.
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
  - getTwapSqrtPriceX96IfFresh(key, windowSeconds)
  - getReferenceSqrtPriceX96(key, twapWindowSeconds)
  - getPrice1e18(key, twapWindowSeconds)
  - getPrice1e18Strict(key): requires a fresh Chainlink price or a fresh pool-derived TWAP

### HedgeReserve
- Role: Holds liquidity buffers for conversions and rebalances.
- Dependencies:
  - OracleAdapter: live-safe reference pricing for conversions, with fresh Chainlink preferred over fresh TWAP.
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
Reactive watcher contracts deploy on Reactive Lasna (`chainId=5318007`, RPC `https://lasna-rpc.rnk.dev/`) or Reactive Mainnet (`chainId=1597`, RPC `https://mainnet-rpc.rnk.dev/`).

For the current Sepolia flow:
- Origin chain: Ethereum Sepolia (`chainId=11155111`)
- Destination chain: Ethereum Sepolia (`chainId=11155111`)
- Sepolia callback proxy: `0xc9f36411C9897e7F959D99ffca2a0Ba7ee0D7bDA`

Reactive callbacks land on GoldgardCallbackReceiver (Sepolia), which checks `msg.sender` against the published Sepolia callback proxy address, then forwards into the core protocol’s transport-agnostic authorized surface.

Tier 1: Reactive callback proxy → GoldgardCallbackReceiver
- `handleAlertLevel(address reactiveContract, uint8 level)` → `GoldgardHook.setAlertLevel(level)`
- `handleTightenThreshold(address reactiveContract, uint256 newThreshold)` → `GoldgardHook.setRebalanceThreshold(newThreshold)`
- `handleAdjustPremiumRate(address reactiveContract, uint256 newRateBps)` → `GoldgardHook.setPremiumRate(newRateBps)`
- `handleEpochCheckpoint(address reactiveContract)` → `SafetyModule.epochCheckpoint()`

Why the leading `address` arg matters:
- Reactive replaces the first 160 bits of callback payload with the ReactVM / reactive contract address.
- Destination handlers therefore need a leading `address` argument to accept true Reactive-delivered callbacks.

Tier 2: GoldgardCallbackReceiver → core contracts
- GoldgardHook and SafetyModule gate their admin surface by authorizedCaller == GoldgardCallbackReceiver.

Event subscriptions (Sepolia → Lasna inference triggers):
- GoldgardHook.OraclePriceUpdated(twap, external_, deviationBps, timestamp)
  - Intended watcher trigger for early oracle divergence detection.
- GoldgardHook.PremiumDiverted(...)
  - Intended watcher input for premium inflow.
- SafetyModule.ClaimPaid(lp, amount, reservePostBalance)
  - Intended watcher input for payout outflow.
- HedgeReserve.ReserveBalanceChanged(newBalance, delta, triggeredBy)
  - Intended watcher input for reserve depletion.

### Verification notes (ETH testnet → frontend)
Known gaps that prevented reliable end-to-end verification were addressed:
- Frontend previously relied on polling reads only; it did not subscribe to contract events, so “reactive” updates were bounded by refetch intervals.
- JSON-RPC proxy was effectively Sepolia-only, blocking multi-chain expansion.
- Callback execution on Sepolia had no dedicated “handled” events, making it difficult to confirm Reactive callbacks landed without inspecting storage.

Implemented fixes (see codebase for details):
- GoldgardCallbackReceiver now emits explicit handler events after successful execution:
  - ReactiveAlertLevelHandled / ReactiveTightenThresholdHandled / ReactivePremiumRateHandled / ReactiveEpochCheckpointHandled.
- Frontend adds a server-side event stream (`/api/events/<chainId>`) that decodes and forwards key on-chain events to the UI in near real time, with bounded backfill and per-chain cursors.
- RPC proxy supports multiple chainIds via per-chain server env var mapping.

### Ongoing monitoring criteria
- RPC health:
  - `eth_chainId` via `/api/rpc/<chainId>` matches expected chainId (mismatch = hard failure).
  - `eth_blockNumber` advances; if stalled while RPC is otherwise healthy, treat as degraded.
- Event ingestion health:
  - SSE stream heartbeat observed at least once every 30s.
  - Cursor advances with chain head; if head advances but cursor does not, treat as missed-events risk.
  - Alert if repeated `eth_getLogs` failures occur (rate-limit, provider outage, ABI mismatch).

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
export REACTIVE_CALLBACK_PROXY=0xc9f36411C9897e7F959D99ffca2a0Ba7ee0D7bDA
forge script script/DeployDemo.s.sol:DeployDemo --rpc-url <SEPOLIA_RPC_URL> --broadcast --verify
```

Outputs:
- Writes `../frontend/app/config/demoConfig.sepolia.json` with deployed addresses.

### Deploy GoldgardReactiveWatcher to Reactive Lasna
Use `forge create` on Lasna; fund the contract with `lREACT` for subscription + callback costs.

```bash
export REACTIVE_PRIVATE_KEY=<YOUR_LASNA_PK>
export REACTIVE_RPC_URL=https://lasna-rpc.rnk.dev/
export REACTIVE_CHAIN_ID=5318007

forge create \
  --rpc-url $REACTIVE_RPC_URL \
  --private-key $REACTIVE_PRIVATE_KEY \
  --chain-id $REACTIVE_CHAIN_ID \
  --value 0.01ether \
  src/GoldgardReactiveWatcher.sol:GoldgardReactiveWatcher \
  --constructor-args \
  <OWNER_ADDRESS> \
  <SEPOLIA_CALLBACK_RECEIVER_ADDRESS> \
  11155111 \
  11155111 \
  300000 \
  <SEPOLIA_HOOK_ADDRESS> \
  <SEPOLIA_HOOK_ADDRESS> \
  <SEPOLIA_SAFETY_MODULE_ADDRESS> \
  <SEPOLIA_HEDGE_RESERVE_ADDRESS>
```

Post-deploy:
- Call `GoldgardCallbackReceiver.setReactiveContract(<LASNA_WATCHER_ADDRESS>)` on Sepolia.
- Top up the watcher if callback or subscription debt accrues.

### Automated deployment helpers
From `goldgard-hookathon/contracts`:

Deploy watcher on Reactive Lasna or Mainnet:
```bash
export DEMO_CONFIG=../frontend/app/config/demoConfig.sepolia.json
export REACTIVE_PRIVATE_KEY=<YOUR_LASNA_OR_MAINNET_PK>
export REACTIVE_DESTINATION_CHAIN_ID=11155111
export REACTIVE_WATCHER_FUNDING_WEI=10000000000000000
export REACTIVE_SUBSCRIBE_ORACLE=true
export REACTIVE_SUBSCRIBE_HOOK=false
export REACTIVE_SUBSCRIBE_SAFETY_MODULE=false
export REACTIVE_SUBSCRIBE_HEDGE_RESERVE=false
forge script script/DeployReactiveWatcher.s.sol:DeployReactiveWatcher \
  --rpc-url https://lasna-rpc.rnk.dev/ \
  --broadcast
```

Debugging notes:
- The deploy script now defaults to an `oracle-only` subscription plan so the first Lasna retry isolates a single `subscribe(...)` call.
- Override any event source without editing code:
  - `REACTIVE_ORACLE_SOURCE`
  - `REACTIVE_HOOK_SOURCE`
  - `REACTIVE_SAFETY_MODULE_SOURCE`
  - `REACTIVE_HEDGE_RESERVE_SOURCE`
- Override any topic0 without editing code:
  - `REACTIVE_ORACLE_TOPIC0`
  - `REACTIVE_HOOK_TOPIC0`
  - `REACTIVE_SAFETY_MODULE_TOPIC0`
  - `REACTIVE_HEDGE_RESERVE_TOPIC0`
- The script logs the exact source addresses, enable flags, and topic0 values used for deployment so Lasna failures can be tied to one subscription tuple at a time.
- If the oracle subscription still reverts, retry with the alternate emitter:
```bash
export REACTIVE_ORACLE_SOURCE=<SEPOLIA_HOOK_OR_ORACLE_ADAPTER>
export REACTIVE_ORACLE_TOPIC0=<TOPIC0_FOR_OraclePriceUpdated(uint256,uint256,uint256,uint256)>
```
- After the oracle path succeeds, enable one additional subscription per deploy attempt by flipping the matching `REACTIVE_SUBSCRIBE_*` flag to `true`.
forge script script/DeployReactiveWatcher.s.sol:DeployReactiveWatcher \
  --rpc-url https://lasna-rpc.rnk.dev/ \
  --broadcast
```

Wire the Sepolia callback receiver to the deployed watcher:
```bash
export DEMO_CONFIG=../frontend/app/config/demoConfig.sepolia.json
export PRIVATE_KEY=<YOUR_SEPOLIA_DEPLOYER_PK>
export REACTIVE_WATCHER=<DEPLOYED_WATCHER_ADDRESS>
forge script script/ConfigureReactiveReceiver.s.sol:ConfigureReactiveReceiver \
  --rpc-url <SEPOLIA_RPC_URL> \
  --broadcast
```

Validate Sepolia core wiring:
```bash
export DEMO_CONFIG=../frontend/app/config/demoConfig.sepolia.json
export REACTIVE_CALLBACK_PROXY=0xc9f36411C9897e7F959D99ffca2a0Ba7ee0D7bDA
forge script script/ValidateDeployment.s.sol:ValidateDeployment --rpc-url <SEPOLIA_RPC_URL>
```

Validate cross-chain reactive wiring:
```bash
export DEMO_CONFIG=../frontend/app/config/demoConfig.sepolia.json
export REACTIVE_WATCHER=<DEPLOYED_WATCHER_ADDRESS>
export REACTIVE_DESTINATION_CHAIN_ID=11155111
export REACTIVE_SUBSCRIBE_ORACLE=true
export REACTIVE_SUBSCRIBE_HOOK=false
export REACTIVE_SUBSCRIBE_SAFETY_MODULE=false
export REACTIVE_SUBSCRIBE_HEDGE_RESERVE=false
forge script script/ValidateReactiveDeployment.s.sol:ValidateReactiveDeployment \
  --rpc-url https://lasna-rpc.rnk.dev/
```

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

## 5) Demo Walkthrough (Presentation Script).

### Demo 1 — “Early warning” rune
Expected outcome: dashboard shows a glowing rune when alert is active.
1. Trigger `GoldgardCallbackReceiver.handleAlertLevel(<reactiveContract>, 1)` from the Reactive callback proxy.
2. Refresh dashboard: rune becomes active, “Pre-warmed” status shows.

### Demo 2 — “Actuarial loop”
Expected outcome: epoch checkpoint emits summary and resets counters.
1. Generate premium via swaps (or call depositPremium via hook path).
2. Execute at least one claim.
3. Trigger `GoldgardCallbackReceiver.handleEpochCheckpoint(<reactiveContract>)` from callback proxy.
4. Verify `epochPremiumIn` and `epochPayoutOut` reset to 0.

### Demo 3 — “Reserve depletion guardrail”
Expected outcome: watcher tightens rebalance threshold; small rebalances no-op.
1. Trigger `GoldgardCallbackReceiver.handleTightenThreshold(<reactiveContract>, highValue)`.
2. Attempt a rebalance with pending < threshold.
3. Confirm `rebalance(...)` returns 0 and pending remains.

## 6) Validation Report

### Staging validation completed
Validated locally on an isolated staging stack:
- Anvil on `127.0.0.1:8546`
- Next.js app on `http://127.0.0.1:3002`
- Local demo contracts deployed and validated with `ValidateDeployment`
- Local reactive watcher deployed and linked to callback receiver, then validated with `ValidateReactiveDeployment`
- Frontend reactive API smoke test passed:
  - `BASE_URL=http://127.0.0.1:3002 CHAIN_ID=31337 SIMULATE=true pnpm validate:reactive`
- Frontend browser reactive validation passed:
  - `BASE_URL=http://127.0.0.1:3002 CHAIN_ID=31337 EXPECTED_NETWORK_LABEL='Local Anvil' pnpm validate:reactive:browser`

Observed staging result:
- `RPC ok`
- `Events ok`
- Dynamic dashboard data rendered without runtime page errors
- Reactive simulation endpoint worked after fixing its Foundry working-directory bug

### Production deployment status
Production-equivalent Lasna/Sepolia deployment is prepared but not broadcast from this workstation.

Blocking inputs still required:
- `SEPOLIA_RPC_URL`
- `PRIVATE_KEY` for the Sepolia owner / receiver configuration account
- `REACTIVE_PRIVATE_KEY` for Lasna watcher deployment

Because those secrets were not present in the environment, this session completed:
- deployment automation
- staging verification
- production preflight documentation

But did **not** complete:
- live Lasna broadcast
- live Sepolia receiver configuration transaction
- live Sepolia/Lasna post-broadcast verification

### Issues fixed during validation
- Destination callback ABI mismatch with Reactive payload injection:
  - Receiver now accepts the leading `address` callback sender argument.
- Frontend simulation endpoint launched Foundry from the wrong directory:
  - `/api/simulate` now executes in `contracts/`, so remappings resolve correctly.
- Reactive deployment/validation lacked reproducible scripts:
  - Added `DeployReactiveWatcher`, `ConfigureReactiveReceiver`, and `ValidateReactiveDeployment`.
