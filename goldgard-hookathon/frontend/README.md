# Goldgard Frontend

This frontend is a Next.js 15 app that sits on top of the Goldgard contracts and demo deployment configs. It provides:

- a landing page for the product story
- a demo console for mint, approve, and swap flows
- a dashboard for reserve, alert, rewards, and contract-backed telemetry
- API routes for RPC proxying, event streaming, simulations, and local demo helpers

## App Structure

- `app/page.tsx`
  - Landing page for the product and demo entrypoints.

- `app/demo/page.tsx`
  - Demo console for minting mock tokens, approving the router, and executing swaps against the configured deployment.
  - Uses `getDemoConfigForChain()` so the UI follows the active supported chain instead of assuming one network.

- `app/dashboard/page.tsx`
  - Live dashboard for reserve assets, reactive alerts, RPC health, wallet balances, GGARD rewards, and simulation output.
  - Reads contract state through `wagmi` and consumes the event stream route for near-real-time updates.

- `app/pool/[address]/page.tsx`
  - Placeholder detail page for future pool-level charts and timelines.

## Contract Wiring

The frontend uses deployment JSON files in `app/config/`:

- `demoConfig.sepolia.json`
- `demoConfig.local.json`

Those files define the deployed addresses for:

- `hook`
- `oracleAdapter`
- `safetyModule`
- `hedgeReserve`
- `rewards`
- `swapRouter`
- `liquidityRouter`
- `token0`
- `token1`
- optional Reactive callback addresses

Runtime access happens through `lib/demoConfig.ts`, which validates and returns config per chain.

## API Routes

- `app/api/rpc/[chainId]/route.ts`
  - RPC proxy used by the frontend and wallet layer.
  - Validates the target chain and forwards JSON-RPC requests to the configured upstream URL.

- `app/api/events/[chainId]/route.ts`
  - Server-sent events endpoint that streams decoded onchain events from the configured Goldgard contracts.

- `app/api/insurance-simulate/route.js`
  - Runs the insurance simulation and returns JSON plus markdown output.
  - Imports from `scripts/insuranceSimulation.mjs`.

- `app/api/testnet-simulations/route.js`
  - Runs the testnet rerun batch flow and returns structured report output.

- `app/api/faucet/route.ts`
  - Local-only helper for minting demo balances when running against Anvil.

## Important Libraries

- `lib/demoConfig.ts`
  - Loads and validates deployment configs.

- `lib/networks.ts`
  - Supported chain list, labels, explorer URLs, and RPC helper paths.

- `lib/eventStream.ts`
  - Browser-side event stream hook used by the dashboard.

- `lib/abi/`
  - Minimal ABIs used for contract reads and writes.

## Favicon

- The app favicon is served from `public/goldgard.png`.
- Metadata is configured in `app/layout.tsx`.

## Development

Install dependencies:

```bash
pnpm install
```

Run the dev server:

```bash
pnpm dev
```

Typecheck:

```bash
pnpm exec tsc --noEmit
```

## Environment Notes

Common env vars used by the frontend server routes:

- `SEPOLIA_RPC_URL`
- `LOCAL_RPC_URL`
- `BASE_SEPOLIA_RPC_URL`
- `OPTIMISM_SEPOLIA_RPC_URL`
- `ARBITRUM_SEPOLIA_RPC_URL`
- `POLYGON_AMOY_RPC_URL`
- `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`

For local demo execution from the UI, set:

- `DEMO_RPC_URL`
- `DEMO_PRIVATE_KEY`
