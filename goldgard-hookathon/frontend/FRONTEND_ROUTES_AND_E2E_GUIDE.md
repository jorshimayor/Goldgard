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
  - “Get Tokens (Faucet)” on local (31337) uses server-side faucet endpoint.
  - Approve swap router spending
  - Execute swaps via SwapRouterNoChecks
- Contract writes (client-side):
  - ERC20 approve(token, spender, amount)
  - SwapRouterNoChecks.swap(...)
- Server-side writes (local-only):
  - `/api/faucet` funds ETH + mints token0/token1 to the connected wallet on Anvil.

## 2) How the Frontend Connects to Contracts

### Config selection (local vs sepolia)
- Frontend selects config based on the active chainId:
  - Local: `app/config/demoConfig.local.json`
  - Sepolia: `app/config/demoConfig.sepolia.json`
- Source: [demoConfig.ts](file:///home/jorel/Goldgard/goldgard-hookathon/frontend/lib/demoConfig.ts)

### RPC routing (mainnet/testnet/anvil) and secret handling
- Client-side reads/writes use wagmi, but **all public RPC reads** are routed through a same-origin JSON-RPC proxy:
  - `POST /api/rpc/<chainId>`
  - Implementation: [route.ts](file:///home/jorel/Goldgard/goldgard-hookathon/frontend/app/api/rpc/%5BchainId%5D/route.ts)
- The proxy forwards to server-only environment variables:
  - `MAINNET_RPC_URL`, `SEPOLIA_RPC_URL`, `GOERLI_RPC_URL`, `DEMO_RPC_URL`
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
    - `NEXT_PUBLIC_MAINNET_WS_RPC_URL`, `NEXT_PUBLIC_SEPOLIA_WS_RPC_URL`, `NEXT_PUBLIC_GOERLI_WS_RPC_URL`, `NEXT_PUBLIC_ANVIL_WS_RPC_URL`
    - WS endpoints that appear to be keyed (Alchemy/Infura/QuickNode URL patterns) are ignored to avoid client-side key exposure.
  - If WS is not configured, the dashboard still stays within the refresh budget via polling.

### Network selection + validation
- The dashboard has an explicit network selector; reads are scoped to the selected network even if no wallet is connected.
- When a wallet is connected, the UI will attempt to switch the wallet network to match the selected network.
- Health checks:
  - `RPC ok/degraded` is derived from calling `eth_chainId` through `/api/rpc/<chainId>` and verifying it matches the selected chainId.
  - `Sync stalled` is raised if the block feed stops updating for an extended period while RPC is otherwise healthy.

## 3) Local End-to-End Testing Guide (Anvil + Frontend)

### Step 1 — Start Anvil
```bash
anvil
```

### Step 2 — Deploy contracts and generate frontend config
From `goldgard-hookathon/contracts`:
```bash
export REACTIVE_CALLBACK_PROXY=0x000000000000000000000000000000000000dEaD
forge script script/DeployDemo.s.sol:DeployDemo --rpc-url http://127.0.0.1:8545 --broadcast
```

This writes:
- `frontend/app/config/demoConfig.local.json`

### Step 3 — Run the frontend
From `goldgard-hookathon/frontend`:
```bash
pnpm install
pnpm dev
```

### Step 4 — Validate core user flows
- Connect wallet (RainbowKit).
- Open `/demo`:
  - Click “Get Tokens (Faucet)” (local only).
  - Approve swap router.
  - Execute swap.
- Open `/dashboard`:
  - Confirm SafetyModule.totalAssets increases after swaps.

### Step 5 — Validate reactive rune signal (local)
To activate the rune on local, call `handleAlertLevel` on the Callback Receiver from the configured proxy address.

If you set `REACTIVE_CALLBACK_PROXY` to an account you control:
```bash
cast send <CALLBACK_RECEIVER_ADDRESS> "handleAlertLevel(uint8)" 1 --rpc-url http://127.0.0.1:8545 --private-key <PK_OF_PROXY>
```
Then refresh `/dashboard` and verify the rune turns active.

## 4) Sepolia End-to-End Guide

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
- If the wallet chainId doesn’t match the selected network, the dashboard will flag `Wallet mismatch`. Switching in-wallet will clear it.

### Local faucet errors
- `/api/faucet` only works on chainId 31337 and requires a server-side private key configured for the node.

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
