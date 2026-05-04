# Goldgard Hookathon — UHI9 (Yield‑Protected AMM)

Goldgard is a Uniswap v4 hook demo that protects LST LP yield like a Viking shieldwall: **oracle‑aware dynamic fees + circuit breaking + post‑swap delta rebalancing** funded by a **0.02% insurance premium** flowing into an **ERC‑4626 Safety Module**.

## Repo Layout

```
goldgard-hookathon/
├── contracts/   (Foundry + Uniswap v4-core/v4-periphery)
└── frontend/    (Next.js 15 + TypeScript + Tailwind + RainbowKit)
```

## UHI9 Mapping
- Delta‑neutral hook: `afterSwap` computes swap deltas and rebalances against `HedgeReserve` in the same transaction.
- Yield protection: `SafetyModule` (ERC‑4626) accumulates swap premiums; claims gated by eligibility + cooldown.
- Fee smoothing & safety: `beforeSwap` does oracle deviation checks, dynamic LP fee override, and circuit breaker.

## Quickstart (Local / Anvil)

### Prereqs
- Node.js 20+ and pnpm
- Foundry (forge/cast/anvil)

### 1) Contracts: deploy the demo pool + hook

```bash
cd contracts
anvil
```

In a second terminal:

```bash
cd contracts
forge script script/DeployDemo.s.sol:DeployDemo \
  --rpc-url http://127.0.0.1:8545 \
  --private-key <ANVIL_PRIVATE_KEY> \
  --broadcast
```

This writes a fresh frontend config to `frontend/app/config/demoConfig.local.json`.

### 2) Frontend: run the dashboard

```bash
cd frontend
pnpm install
pnpm dev
```

Set `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` in `frontend/.env.local` to enable WalletConnect.

Open:
- `/` landing
- `/dashboard` dashboard
- `/demo` demo console (mint → approve → execute)

### 3) Price swing simulation (script + UI)

Script (recommended for deterministic runs):

```bash
cd contracts
forge script script/SimulatePriceSwing.s.sol:SimulatePriceSwing \
  --rpc-url http://127.0.0.1:8545 \
  --private-key <ANVIL_PRIVATE_KEY> \
  --broadcast
```

UI trigger (local only):
- set `DEMO_RPC_URL` and `DEMO_PRIVATE_KEY` in `frontend/.env.local`
- click “Run 10% Swing (Local)” on `/dashboard`

## Sepolia Deployment

Use the same Foundry scripts with a Sepolia RPC URL and funded private key:

```bash
cd contracts
forge script script/DeployDemo.s.sol:DeployDemo \
  --rpc-url <SEPOLIA_RPC_URL> \
  --private-key <SEPOLIA_PRIVATE_KEY> \
  --broadcast \
  --verify \
  --etherscan-api-key <ETHERSCAN_KEY>
```

Placeholders (fill after deploy):
- PoolManager: https://sepolia.etherscan.io/address/0x...
- GoldgardHook: https://sepolia.etherscan.io/address/0x...
- SafetyModule: https://sepolia.etherscan.io/address/0x...

## Solidity / Compiler Note

Goldgard contracts use `pragma solidity ^0.8.24;`. Uniswap v4-core pins `=0.8.26`, so the Foundry toolchain compiles the workspace with `0.8.26` while remaining source‑compatible with `^0.8.24`.

## Submission Artifacts

- Pitch deck outline: `pitch-deck-outline.md`
- Product/tech/page specs: `.trae/documents/` (PRD + tech architecture + page design)

## Post‑Hackathon Roadmap

- Head & Branch: modular hedging policies per pool archetype
- synBNC CDP: collateralized delta‑neutral borrowing against LST yields
- BTC Yield Vault: cross‑margin hedging and risk‑tranching for BTC‑denominated yield

