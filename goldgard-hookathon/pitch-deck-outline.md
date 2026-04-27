# Goldgard — Pitch Deck Outline (UHI9)

## 1. Title
- Goldgard — Yield Shield of the LSTs
- Tagline: Protect Thy Yield — The First Delta‑Neutral LST Hook

## 2. The LST LP Trap
- LST/USDC pools attract “safe yield” capital
- Impermanent loss during price swings silently wipes yield
- LPs either accept directional risk or leave liquidity thin

## 3. The Insight
- The pool’s delta changes on every swap
- If we can hedge that delta atomically, we reduce IL pain
- If we can fund insurance sustainably, we align incentives

## 4. The Solution: Goldgard Hook
- beforeSwap: oracle deviation guard + dynamic fee + circuit breaker
- afterSwap: compute delta → rebalance against HedgeReserve via flash accounting (EIP‑1153)
- afterAddLiquidity: track liquidity‑seconds and enroll for IL insurance

## 5. How It Works (One Transaction)
- User swaps
- Premium is diverted into SafetyModule (ERC‑4626)
- Hook rebalances inventory (delta neutralization)
- Rewards accrue (ERC‑6909 claims)

## 6. Safety Module
- 0.02% premium per swap funds reserve
- Claims have 14‑day cooldown
- Eligibility: 80%+ in‑range liquidity‑seconds
- Payout targets IL on the enrolled principal

## 7. Why Uniswap v4 Hooks
- Native hook points + dynamic fee override
- Flash accounting unlocks atomic net‑zero flows
- Reduced MEV surface vs multi‑tx rebalancing

## 8. Demo (Under 4 Minutes)
- Deploy demo pool + hook (local or Sepolia)
- Run swaps from Demo Console
- Trigger a 10% swing and show:
  - Control LP value vs Goldgard LP value
  - Safety balance rising from premiums
  - Rewards accruing to users

## 9. Benchmarks
- Gas: single‑tx swap+rebalance vs split “legacy” pattern
- Risk: circuit breaker prevents oracle divergence exploitation

## 10. Roadmap
- Head & Branch hedging strategies per asset class
- synBNC CDP and composable leverage
- BTC Yield Vault and cross‑margin hedging primitives

