# Architecture

Everything you need to understand how Stradebase is built: the model, the repo layout, the on-chain
programs, and the backend.

## 1. What it is

Stradebase is a Solana platform for **fractional music-royalty ownership**. An artist lists a song as
a fixed supply of royalty **shares**; verified investors buy shares, hold them, and resell them, and
receive a pro-rata cut of the song's royalties. Prices are denominated in **SBTS**, a GBP-pegged
stablecoin the platform controls; the platform also supports **USDC/USDT** and mints tier **NFTs**.

### The core model : a ledger of record

The on-chain programs are a **ledger of record: they move no money.**

- The chain **issues and moves the share tokens** (real Token-2022 assets) and **records every
  economic event**; purchases, resales, royalty distributions; with amounts stored as data.
- **Money (SBTS/USD stablecoins/fiat) settles off-chain** through the backend's payment rail. The
  chain is authoritative for *ownership and history*; the API owns *cash movement*.
- The platform is **custodial**: it holds users' wallet keys. A user initiates an action from the
  frontend and the backend **co-signs** with their key to finalize it. No shared vault ever holds
  user funds, value goes directly between parties.

### Compliance & privacy in one glance

- **Every transfer is checked** against the rules before it can complete (identity, sanctions/risk
  status, country, ownership caps, lock-ups). A non-compliant transfer simply fails.
- **Personal data never goes on-chain.** Only a salted one-way hash of it does; the data itself
  stays in backend systems. Wallet address, optional public username, country code, and trade
  history are public by design.

## 2. Repository layout

```
stradebaseSBT/
├── programs/
│   ├── royalty-shares/   Anchor program — identity, listings, primary issuance, trade + payout records, admin
│   └── transfer-hook/    Token-2022 compliance gate run on every share transfer
├── packages/
│   └── blockchain/       @stradebase/blockchain — SBTS/USDC/USDT SDK (balances, transfers, ATAs, history parsing)
├── api/
│   ├── onchain/          @stradebase/onchain — typed client for the two programs (IDs, PDAs, IDL/types, readers)
│   └── server/           @stradebase/api — the backend (tokens, royalties, NFTs, indexer, custody signing)
├── sbtBoard/             Next.js admin dashboard (token, NFT, and royalty admin)
├── assets/nft-metadata/  NFT tier metadata JSON
├── tests/                Anchor integration + property/fuzz suites
├── Anchor.toml · Cargo.toml · pnpm-workspace.yaml
└── docs/                 this documentation
```

The pnpm workspace covers `packages/*` and `api/*`. The Anchor workspace (`programs/`, `tests/`) and
the Next.js app (`sbtBoard/`) manage their own toolchains.

## 3. On-chain programs

### `royalty_shares`: `mWG6dhh3iZpTbdjxhc7k8PwqLKkKUFekcWqWRUNXruZ`

The RWA core. Accounts (all program-derived):

| Account              | Holds                                                                                                                  |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `GlobalConfig`       | singleton: ops + compliance authorities, treasury, settlement-currency reference, recorded fee, global cap, pause flag |
| `IdentityRegistry`   | per user: KYC level, jurisdiction, `ComplianceStatus`, accreditation, **salted PII commitment** (+ version/scheme)     |
| `UserProfile`        | per user: role (Artist/Investor/Both), public username, listing/trade counters                                         |
| `UsernameRecord`     | a claimed username (uniqueness enforced by the runtime)                                                                |
| `SongListing`        | a "card": fixed supply, price, status, lockup, cumulative royalties, trade/distribution counters                       |
| share mint           | Token-2022, 0 decimals, TransferHook + MetadataPointer extensions; mint authority = the listing                        |
| `ComplianceConfig`   | per listing: per-wallet cap + blocklist (seeded by mint so the hook can resolve it)                                    |
| `HolderPosition`     | per holder: lock-up unlock time (read by the hook)                                                                     |
| `TradeRecord`        | immutable audit row for **both** primary and secondary sales                                                           |
| `DistributionRecord` | immutable audit row for a royalty payout (paid off-chain)                                                              |

Instructions:

- **Platform:** `initialize_global`, `set_global_pause`, `set_listing_status`, `update_platform_fee`.
- **Identity:** `register_identity` (KYC + PII commitment), `set_pii_commitment`,
  `claim_username` / `release_username`, `create_user_profile` / `update_user_role`.
- **Trading:** `create_listing`, `buy_shares` (primary — mints shares + writes a `TradeRecord`),
  `record_secondary_trade` (resale — writes a `TradeRecord` in the same transaction as the token
  transfer, verified by transaction introspection), `record_distribution` (royalty payout record).
- **Compliance:** `block_user` / `unblock_user` / `update_compliance`.

### `transfer_hook`: `pk9fzHd77xiV5w5mqEsjfa8RKjdye9t9hY8W2VBUpEV`

A Token-2022 transfer hook that runs on **every** share transfer and can only approve or reject it.
It enforces: global pause, compliance status (sender may send, recipient may receive), KYC,
blocklist, per-wallet + global ownership caps, jurisdiction allow-list, accreditation, and sender
lock-up. It is read-only and resolves all its accounts on-chain from the mint, so it cannot be fed
spoofed compliance data.

### Design points that matter

- **Compliance is enforced twice:** inline in `buy_shares` (primary), and again by the hook on every
  secondary move. Both gate on `ComplianceStatus { Ok, Restricted, Frozen }`, `Restricted` may still
  *receive* (so a review doesn't strand a counterparty), but not send or buy.
- **One trade ledger:** primary and secondary sales share the same `["trade", listing, index]`
  space, so one scan of a listing gives the full ordered history. `record_secondary_trade`
  introspects the transaction and only writes the record if a matching Token-2022 transfer (same
  mint, amount, seller, and buyer's token account) is present, the ledger can't diverge from a real
  transfer.
- **Privacy:** the PII commitment is `sha256(salt || canonical_json(pii))`; the 32-byte per-user salt
  lives (encrypted) in the backend and is the right-to-erasure mechanism. `ComplianceStatus` is
  reason-free, so the chain never publishes *why* a wallet is restricted.
- **No money on-chain:** there is no vault; `buy_shares` mints without a payment leg, and royalty
  payouts are recorded (`record_distribution`), not moved. See §1.
- **Events:** every state-changing instruction emits an `emit!` event (`events.rs`) — listing
  created, shares purchased, secondary trade, royalty distributed, identity/PII/profile/role,
  username claimed/released, compliance/status/pause/fee changes — so indexers and dashboards can
  observe transitions in real time (in addition to reading account state).

## 4. Backend (`api/server`, `@stradebase/api`)

An Express service, the single API the frontend and integrations call.

**Services (`src/services/`)**

- `tokens.ts` — mint/transfer/balance/history/freeze for SBTS/USDC/USDT, plus `unifiedBalance`.
- `royalties.ts` — every `/royalties/*` endpoint (init, identity, PII, username, profile, listing,
  buy, secondary transfer, distribute, reads, reconcile, admin).
- `fx.ts` + `unified.ts` — GBP/USD rate (fixed constant or live Pyth) and the unified-balance math;
  decimals + conversion + formatting resolved server-side so the frontend renders finished strings.
- `pii.ts` — the salted PII commitment (canonical serialization + verify). The only sanctioned way
  to produce the on-chain commitment.
- `nfts.ts` — tier NFTs via Metaplex Core (mint, collection, freeze).
- `distribute.ts` — bulk pre-mint + pooled parallel transfers, for fast share drops.

**Infrastructure (`src/`)**

- `tx/engine.ts` — the resilient submit path all writes go through: fee-payer pool, priority fees,
  fresh-blockhash retry, bounded concurrency (sheds load with `429`). Signs via the `TxSigner` seam.
- `signing/` — the **custody seam**: `TxSigner` interface, `LocalKeypairSigner` (dev), `RemoteSigner`
  - `SignBackend` (custody: `InProcessVault` / `HttpSignBackend`), a reference signer service, and
    `resolveSigner` (routes a write to `secret` in dev or `keyRef` in custody mode).
- `indexer/` — reconstructs share movements from token-balance deltas to **reconcile** against the
  on-chain trade ledger (flags any transfer with no record) and to serve reads at scale. Pluggable
  store: `InMemoryStore` (default) or `PgStore` (Postgres).
- `config.ts`, `app.ts`, `http.ts`, `cache.ts`, `idempotency.ts` — env, routing, helpers.

**Typed client (`api/onchain`,** **`@stradebase/onchain`)** — program IDs, all PDA derivations, typed
program handles + readers, and the generated IDL/types. The backend calls the programs through this;
after any on-chain change: `anchor build` then `api/onchain/scripts/sync-idl.sh`.

## 5. Token model

| Token | Peg | Program    | Platform mints? | Platform freezes?                   |
| ----- | --- | ---------- | --------------- | ----------------------------------- |
| SBTS  | GBP | Token-2022 | ✅               | ✅ (platform holds freeze authority) |
| USDC  | USD | SPL Token  | ❌               | ❌                                   |
| USDT  | USD | SPL Token  | ❌               | ❌                                   |

SBTS is the currency prices are quoted in. Because SBTS is GBP and USDC/USDT are USD, the API can
present one **unified balance in SBTS**, converting USD holdings at GBP/USD
(`GET /balances/:owner/unified`).

## 6. Scale & operations

Built and load-tested on a single instance:

- Fee-payer pool + priority fees + blockhash-retry + backpressure in `tx/engine.ts` (proven with a
  40-concurrent-write burst test).
- Idempotency (via an `Idempotency-Key` header), a short read cache, and a per-IP rate limit.
- The bulk `/distribute` path (pre-mint + pooled transfers) for high-volume payouts.

To reach large scale in production (backend team's work — see [backend-handover.md](backend-handover.md)):

- A **read-indexer + database** serving balances/history/listings instead of live RPC.
- **Durable, shared stores** (Postgres for the indexer, Redis for cache/idempotency/rate-limit).
- A **paid RPC** with failover, a write **queue** + worker fleet, and monitoring.
- **Hardened key custody** (KMS/MPC) — the top pre-launch security task.

## 7. Testing

| Suite                  | Command                                       | Covers                                                                                                             |
| ---------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| On-chain               | `anchor test`                                 | primary + secondary sales, royalties, identity/usernames/PII, transfer-hook compliance, economic invariants (fuzz) |
| Unified balance        | `pnpm --filter @stradebase/api unified-test`  | FX conversion, decimals, rounding, formatting (pure)                                                               |
| Postgres store         | `pnpm --filter @stradebase/api pgstore-test`  | indexer store SQL/mapping against a fake client                                                                    |
| PII helper             | `pnpm --filter @stradebase/api pii`           | canonical hashing, verify, username rules (pure)                                                                   |
| Tokens/NFT/unified e2e | `pnpm --filter @stradebase/api e2e`           | mint/transfer/freeze/history + NFT + unified balance (validator)                                                   |
| Royalties e2e          | `pnpm --filter @stradebase/api royalties-e2e` | full royalty flow, `secret` signing (validator)                                                                    |
| Custody e2e            | `pnpm --filter @stradebase/api signer-e2e`    | full royalty flow, `keyRef` custody signing (validator)                                                            |
| Indexer e2e            | `pnpm --filter @stradebase/api indexer-test`  | secondary record + reconciliation (validator)                                                                      |
| Burst                  | `pnpm --filter @stradebase/api burst`         | concurrency + idempotency under load (validator)                                                                   |

The e2e suites need a local validator with both programs deployed. See [devnet.md](devnet.md) for
running against a cluster, [api.md](api.md) for the endpoint reference, and
[security.md](security.md) for the security & compliance model.
