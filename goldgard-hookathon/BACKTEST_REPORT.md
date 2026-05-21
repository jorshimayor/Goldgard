# Goldgard Protocol Backtest Report (Testnet/Mainnet-Data Proxy)

This report documents a sustainability backtest focused on **premium accrual vs IL payout dynamics**, using **Ethereum mainnet historical swap data as a proxy** for two target markets:

- **vETH/USDC** → proxied by **Uniswap V3 USDC/WETH 0.05%** pool `0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640`
- **stETH/ETH** → proxied by **Uniswap V3 wstETH/WETH 0.01%** pool `0x109830a1aaad605bbf02a9dfa7b0b92ec2fb7daa`

Pool references:
- Uniswap app (wstETH/WETH 0.01%): https://app.uniswap.org/explore/pools/ethereum/0x109830a1AAaD605BbF02a9dFA7B0B92EC2FB7dAa
- Uniswap app (stETH/WETH 0.01%): https://app.uniswap.org/explore/pools/ethereum/0x8f8eaaf88448ba31bdfff6ad8c42830c032c6392

## 1) Methodology

### Premium model
- Premium is modeled as a constant **premium bps** applied to the “volume notional” for a window.
- Premium rate used in baseline run: **2 bps (0.02%)** (matches `GoldgardHook.PREMIUM_BPS` default).

### IL payout model
- Payout uses Goldgard’s IL approximation:
  - `IL_bps = (1 - 2*sqrt(r)/(1+r)) * 10_000` where `r = price_end/price_start`.
- Payout is computed as:
  - `payout = principal * IL_bps / 10_000`
- This is a **model-level** backtest and does not model:
  - LP range selection,
  - fee income,
  - partial withdrawals,
  - claim cooldown/eligibility,
  - reserve hard cap behavior (other than the optional coverage cap described below).

### Market regimes
Three regimes are selected automatically from rolling swap windows:
- **Volatile:** highest “sum of absolute returns” within the window.
- **Calm:** lowest “sum of absolute returns” within the window.
- **Drift:** highest net drift among the remaining windows.

## 2) Baseline Parameters (Baseline Run)

Baseline was executed with:
- RPC: `https://ethereum.publicnode.com`
- `LOOKBACK_BLOCKS=120000`
- `LOG_STEP_BLOCKS=500`
- `WINDOW_SWAPS=800`
- `PREMIUM_BPS=2`
- Principal amounts (per-pool default inside the script):
  - USDC/WETH: **1,000,000 USDC**
  - wstETH/WETH: **100 WETH**

## 3) Baseline Results

### A) vETH/USDC proxy (USDC/WETH 0.05%)

Block range: `25025505..25145505`  
Swaps fetched: `74005`  
Window size: `800 swaps`

**Volatile**
- IL: `0 bps`
- Premium volume: `15,892,931.899347 USDC`
- Premium in: `3,178.586379 USDC`
- Payout out: `0.000000 USDC`
- Shortfall: `0.000000 USDC`
- Implied premium bps needed: `0`

**Calm**
- IL: `0 bps`
- Premium volume: `850,964.520044 USDC`
- Premium in: `170.192904 USDC`
- Payout out: `0.000000 USDC`
- Shortfall: `0.000000 USDC`
- Implied premium bps needed: `0`

**Drift**
- IL: `1 bps`
- Premium volume: `45,813,294.231573 USDC`
- Premium in: `9,162.658846 USDC`
- Payout out: `100.000000 USDC`
- Shortfall: `0.000000 USDC`
- Implied premium bps needed: `1`

### B) stETH/ETH proxy (wstETH/WETH 0.01%)

Block range: `25025535..25145535`  
Swaps fetched: `3726`  
Window size: `800 swaps`

**Volatile**
- IL: `0 bps`
- Premium volume: `12,027.900381210257808557 WETH`
- Premium in: `2.405580076242051561 WETH`
- Payout out: `0.000000000000000000 WETH`
- Shortfall: `0.000000000000000000 WETH`
- Implied premium bps needed: `0`

**Calm**
- IL: `0 bps`
- Premium volume: `4,717.141406142083923210 WETH`
- Premium in: `0.943428281228416784 WETH`
- Payout out: `0.000000000000000000 WETH`
- Shortfall: `0.000000000000000000 WETH`
- Implied premium bps needed: `0`

**Drift**
- IL: `0 bps`
- Premium volume: `3,480.851363027603468065 WETH`
- Premium in: `0.696170272605520693 WETH`
- Payout out: `0.000000000000000000 WETH`
- Shortfall: `0.000000000000000000 WETH`
- Implied premium bps needed: `0`

## 4) Identified Issues

- No capital shortfalls were observed in the baseline run windows.
- The stETH/ETH proxy windows in this limited lookback showed **very low IL**, so the run does not stress deep tail scenarios (large directional swings).

## 5) Parameter Adjustments

No parameter changes were required to eliminate shortfalls in the baseline run.

To support tuning in future backtests and testnet validation, the Sepolia hook now supports a **coverage cap** (hard cap on IL bps applied):

- `GoldgardHook.coverageCapBps` default: `10_000` (no cap)
- Settable at deploy time via `COVERAGE_CAP_BPS` in [DeployDemo.s.sol](file:///home/jorel/Goldgard/goldgard-hookathon/contracts/script/DeployDemo.s.sol)

This cap allows controlling worst-case payout amplification during extreme regimes.

## 6) Validation (Post-adjustment)

- Since no adjustments were required, validation is satisfied by the baseline results (no shortfall across volatile/calm/drift windows).
- The codebase supports re-running the backtest across deeper historical regimes by extending block ranges and/or narrowing log chunk size as needed.

## 7) Reproducibility Guide

### Run backtest
From `goldgard-hookathon/frontend`:

```bash
pnpm install --frozen-lockfile
LOOKBACK_BLOCKS=120000 LOG_STEP_BLOCKS=500 WINDOW_SWAPS=800 PREMIUM_BPS=2 node scripts/backtest.mjs
```

### Target specific historical ranges
```bash
FROM_BLOCK=<start> TO_BLOCK=<end> LOG_STEP_BLOCKS=250 WINDOW_SWAPS=800 node scripts/backtest.mjs
```

If your RPC times out on `eth_getLogs`, reduce `LOG_STEP_BLOCKS`.

