# Stradebase docs

Start here. Stradebase is a Solana platform for **fractional music-royalty ownership**: artists sell
royalty shares of their songs to verified investors, priced in a GBP-pegged stablecoin (SBTS), with
identity and trading rules enforced on-chain.

## The model in three lines

- **The chain is a ledger of record — it moves no money.** It issues/moves the share tokens and
  records every purchase, resale, and payout; money settles off-chain via the backend.
- **The platform is custodial** — it holds users' keys and co-signs after the user initiates.
- **SBTS (GBP)** is the pricing currency; USDC/USDT are supported, and the API can show one unified
  balance in SBTS.

## Read by goal

- **Understand the system** → [architecture.md](architecture.md)
- **Deploy + test on devnet** → [devnet.md](devnet.md), with [api.md](api.md) (reference) and
  [api.http](api.http) (runnable requests)
- **Hand it to the backend dev (Kwame)** → [backend-handover.md](backend-handover.md), with
  [pyth-indexer.md](pyth-indexer.md) (Pyth FX + Alchemy indexer setup) and
  [payments-fx.md](payments-fx.md) (deposits, FX, withdrawals, mass royalty payouts)
- **Security & compliance / legal** → [security.md](security.md)

## All documents

| Doc | What it's for |
|-----|---------------|
| [architecture.md](architecture.md) | The whole system: model, repo layout, on-chain programs, backend, scale, testing |
| [api.md](api.md) | HTTP endpoint reference (every route + request/response shapes) |
| [api.http](api.http) | Runnable requests for every endpoint (VS Code REST Client / JetBrains) |
| [api-http-explained.md](api-http-explained.md) | Plain-English, request-by-request walkthrough of api.http (for Conrad & Kwame) |
| [devnet.md](devnet.md) | Deploy + configure + test every endpoint on devnet, end to end |
| [backend-handover.md](backend-handover.md) | For Kwame: what's done on-chain, the reference backend, and what to build on the master codebase |
| [pyth-indexer.md](pyth-indexer.md) | Backend setup: live Pyth GBP/USD FX + the Alchemy-backed secondary-trade indexer (Postgres) |
| [payments-fx.md](payments-fx.md) | Deposits, FX (show GBP → hold GBP), withdrawals, and mass royalty payouts at scale (BVNK) |
| [security.md](security.md) | Compliance controls, what's verified safe, privacy, custody, pre-mainnet checklist |
| [conrad-overview.md](conrad-overview.md) | **Detailed end-to-end overview for Conrad** — the full picture, beginning to end |
| [product-update.md](product-update.md) | Plain-English product + legal summary (for Conrad) |
| [conrad-update.md](conrad-update.md) | For Conrad: what Josh built (blockchain core + prototype) vs what the backend team does on the master codebase |

## What's done vs. what the backend team owns

**Done and tested** (green across `anchor test` + the API suites): both Solana programs and the
on-chain trade ledger (primary → secondary), the compliance hook, SBTS/USDC/USDT
mint/transfer/balances/history/freeze, the unified SBTS balance, royalties (listings, primary
issuance, recorded distributions), identity (usernames + hashed PII), tier NFTs, the reconciliation
indexer, the resilient tx engine, and the custodial signing seam (working `keyRef` path).

**Owned by the backend team** — off-chain/infra, not Solana code (see
[backend-handover.md](backend-handover.md)): real key custody (KMS/MPC), auth, the money rail
(payments/payouts), durable stores (Postgres/Redis), a scaled read-indexer, and ops.

## Test commands

```bash
anchor test                                   # on-chain suites
pnpm --filter @stradebase/api unified-test    # unified-balance math
pnpm --filter @stradebase/api pgstore-test    # Postgres store mapping
pnpm --filter @stradebase/api pii             # PII hashing / username rules
# with a local validator + `anchor deploy`:
pnpm --filter @stradebase/api e2e             # tokens / NFT / unified balance
pnpm --filter @stradebase/api royalties-e2e   # royalty flow (secret mode)
pnpm --filter @stradebase/api signer-e2e      # royalty flow (custody keyRef mode)
pnpm --filter @stradebase/api indexer-test    # secondary-trade record + reconcile
pnpm --filter @stradebase/api burst           # concurrency + idempotency
```
