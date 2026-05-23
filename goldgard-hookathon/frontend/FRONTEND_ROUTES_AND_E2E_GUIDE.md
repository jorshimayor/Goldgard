# Goldgard Frontend — Routes, Contract Wiring, and End-to-End Demo Guide

## 1) Route Map (Page-by-page)

### `/` (Landing)
- Purpose: Narrative entry point and navigation into the demo.
- Primary user actions:
  - Navigate to Dashboard (`/dashboard`)
  - Navigate to Demo Console (`/demo`)
- Contract interactions: none (presentation-only).

### `/dashboard` (Shieldwall Dashboard)
- Purpose: Present key protocol status and reactive “early warning” signal.
- Key UI blocks:
  - Stat tiles (SafetyModule total assets, reward balances, etc.)
  - “Reactive Sentinel” rune indicator:
    - Reads GoldgardHook.getReactiveAlert() and renders a glowing rune while active.
  - Live time-series chart (in-memory rolling series from on-chain reads; refresh ≤ 5s).
- Contract reads:
  - SafetyModule.totalAssets()
  - SafetyModule.asset() → ERC20.decimals()/symbol() (for correct unit formatting)
  - RewardDistributor.GGARD_ID + balanceOf(address,id)
  - GoldgardHook.getReactiveAlert()
- Contract writes:
  - Optional: `/api/simulate` trigger button (executes Foundry script server-side).

### `/demo` (Demo Console)
- Purpose: Execute the main “swap → premium → rebalance” user flow.
- Key user actions:
  - Mint demo tokens (MockERC20.mint)
  - Approve swap router spending
  - Execute swaps via SwapRouterNoChecks
- Contract writes (client-side):
  - ERC20 approve(token, spender, amount)
  - SwapRouterNoChecks.swap(...)

## 2) How the Frontend Connects to Contracts

### Config selection (Sepolia-only)
- Frontend uses Sepolia config:
  - `app/config/demoConfig.sepolia.json`
- Source: [demoConfig.ts](file:///home/jorel/Goldgard/goldgard-hookathon/frontend/lib/demoConfig.ts)

### RPC routing (Sepolia-only) and secret handling
- Client-side reads/writes use wagmi, but **all public RPC reads** are routed through a same-origin JSON-RPC proxy:
  - `POST /api/rpc/<chainId>`
  - Implementation: [route.ts](file:///home/jorel/Goldgard/goldgard-hookathon/frontend/app/api/rpc/%5BchainId%5D/route.ts)
- The proxy forwards to a server-only environment variable:
  - `SEPOLIA_RPC_URL`
- This keeps API keys off the client; the browser only sees `/api/rpc/<chainId>`.
- The proxy validates `eth_chainId` responses and returns an error on chainId mismatches to prevent cross-network data confusion.

### Wallet + signing
- wagmi + RainbowKit provide:
  - Wallet connect UI
  - Read calls (public RPC)
  - Write calls (wallet-signed transactions)
- Provider setup: [providers.tsx](file:///home/jorel/Goldgard/goldgard-hookathon/frontend/app/providers.tsx)

### Event listening logic
- Dashboard uses a 5s-or-less refresh budget:
  - Polling contract reads via wagmi query `refetchInterval` (≤ 5s).
  - Optional WebSocket block subscription when a WS endpoint is configured:
    - `NEXT_PUBLIC_SEPOLIA_WS_RPC_URL`
    - WS endpoints that appear to be keyed (Alchemy/Infura/QuickNode URL patterns) are ignored to avoid client-side key exposure.
  - If WS is not configured, the dashboard still stays within the refresh budget via polling.

### Network selection + validation
- The app is locked to Sepolia for testing and demos.
- When a wallet is connected, the UI will prompt to switch the wallet network to Sepolia and keep it there.
- Health checks:
  - `RPC ok/degraded` is derived from calling `eth_chainId` through `/api/rpc/<chainId>` and verifying it matches the selected chainId.
  - `Sync stalled` is raised if the block feed stops updating for an extended period while RPC is otherwise healthy.

## 3) Sepolia End-to-End Guide

### Deploy to Sepolia
From `goldgard-hookathon/contracts`:
```bash
export PRIVATE_KEY=<YOUR_SEPOLIA_DEPLOYER_PK>
export REACTIVE_CALLBACK_PROXY=<REACTIVE_SEPOLIA_CALLBACK_PROXY>
forge script script/DeployDemo.s.sol:DeployDemo --rpc-url <SEPOLIA_RPC_URL> --broadcast --verify
```

This writes:
- `frontend/app/config/demoConfig.sepolia.json`

### Run frontend against Sepolia
- Ensure your wallet is set to Sepolia.
- Open the app and connect the wallet.
- The app will use the Sepolia config when chainId is 11155111.

### Validate reads
- `/dashboard` should show contract reads resolve (non-zero addresses; no “not configured” warnings).

### Validate writes
- `/demo`:
  - Approve and swap with your Sepolia wallet.
  - Confirm tx receipts on Etherscan.

## 5) Presentation Walkthrough (Suggested Script)

### Segment A — “Goldgard Protection Loop”
- Go to `/demo`.
- Get tokens (local) or ensure balances (Sepolia).
- Approve swap router and execute a swap.
- Explain: premium is diverted to SafetyModule; hook can queue rebalances.

### Segment B — “Shieldwall Dashboard”
- Go to `/dashboard`.
- Show:
  - SafetyModule balance moving as swaps occur.
  - Reactive Sentinel rune state (quiet vs active).

### Segment C — “Lasna Reactive Surface (Judges’ visible artifact)”
- Trigger `handleAlertLevel` via the Reactive callback proxy (on the Callback Receiver).
- Refresh dashboard and show the glowing rune.
- Explain: the hook will pre-warm its dynamic fee curve, closing the “one swap latency” gap.

## Troubleshooting

### Wrong network
- If the wallet chainId doesn’t match Sepolia, the UI will prompt to switch and will flag `Wallet mismatch` until it matches.

### Faucet
- There is no faucet endpoint for Sepolia mode; token minting is done by calling MockERC20.mint from the connected wallet.

### Network health checks
- Dashboard shows RPC status:
  - `RPC ok` means `/api/rpc/<chainId>` responds and returns the expected `eth_chainId`.
  - `RPC degraded` means the active chain proxy is misconfigured or unreachable.

### E2E network smoke check
With the frontend server running, execute:
```bash
node scripts/e2e-dashboard.mjs
```

### WalletConnect “Core initialized multiple times”
- Ensure providers are not mounted multiple times; config is cached in [providers.tsx](file:///home/jorel/Goldgard/goldgard-hookathon/frontend/app/providers.tsx).
