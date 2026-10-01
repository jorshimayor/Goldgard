# Backend handover — for Kwame

**What this repo is:** the Solana/on-chain programs (complete) plus a **reference backend** that
proves the full flow end to end. It's not the production backend — it's the spec + working
integration you port into the master codebase.

| Bucket | Status | Owner |
|---|---|---|
| **A. Blockchain (on-chain programs)** | ✅ done + tested — integrate, don't rebuild | on-chain (Josh) |
| **B. Reference backend (`api/server`)** | ✅ works end to end, with test-only shortcuts | Josh (reference) |
| **C. Master codebase** | ⬜ port + harden + build the net-new pieces | **Kwame** |

Read [architecture.md](architecture.md) for the full technical picture and [devnet.md](devnet.md) to
run it.

---

## A. Blockchain — done (integrate against it, don't change it)

Two Anchor programs, fixed IDs, fully tested:

- `royalty_shares` — `mWG6dhh3iZpTbdjxhc7k8PwqLKkKUFekcWqWRUNXruZ`
- `transfer_hook` — `pk9fzHd77xiV5w5mqEsjfa8RKjdye9t9hY8W2VBUpEV`

Accounts, instructions, and the compliance/privacy model are in [architecture.md](architecture.md)
§3. The key idea: the chain is a **ledger of record** — it issues/moves the **share tokens** and
records every economic event; **money settles off-chain** (your job, §C).

**How you call it:** reuse the typed client **`api/onchain` (`@stradebase/onchain`)** — program IDs,
all PDA derivations, typed program handles + readers, and the generated IDL/types. After any on-chain
change: `anchor build` then `api/onchain/scripts/sync-idl.sh`. You should not need to touch the Rust
programs — treat A as a fixed dependency.

---

## B. Reference backend (`api/server`) — what exists, and its shortcuts

A working Express service that exercises everything. Use it as the **reference implementation and the
API contract** ([api.md](api.md) + [api.http](api.http)). It's functionally complete but carries
deliberate **test-only shortcuts** you must replace.

**Services (`src/services/`):** `tokens.ts` (mint/transfer/balance/history/freeze + `unifiedBalance`),
`royalties.ts` (all `/royalties/*`), `fx.ts` + `unified.ts` (GBP/USD + unified-balance math),
`pii.ts` (the salted PII commitment — **reuse this exactly**), `nfts.ts`, `distribute.ts`.

**Infrastructure (`src/`):** `tx/engine.ts` (resilient submit — all writes go through it; **keep**),
`signing/` (the **custody seam**, §C.1), `indexer/` (reconciliation + read-scaling; store is
pluggable), `config.ts`, `app.ts`, `http.ts`, `cache.ts`, `idempotency.ts`.

**⚠️ Test-only shortcuts (must NOT ship as-is):**
1. **Keys in the request body.** Writes accept a raw `secret` — a dev convenience. Production uses the
   `keyRef` custody path (§C.1).
2. **In-memory state.** `cache`, `idempotency`, rate-limit, and the default indexer store are
   per-process — fine for one box, not for real load or multiple instances.
3. **No authentication/authorization** beyond a basic per-IP rate limit.
4. **No money rail.** The API records settlement *amounts*; it does not move funds.

---

## C. What Kwame does on the master codebase

Port the contract from B and close the four shortcuts. In priority order:

### 1. Custody (blocking for launch)

All on-chain writes sign through one interface — `TxSigner` in `api/server/src/signing/signer.ts`:

```ts
export interface TxSigner {
  readonly publicKey: PublicKey;
  signMessage(message: Uint8Array): Promise<Uint8Array>; // 64-byte ed25519 signature
}
```

`tx/engine.ts::submit` builds the transaction, calls `signMessage`, and attaches the signatures. This
message-based shape is the only one that works for both local keypairs and remote signers (an HSM/MPC
never exposes a secret key). Shipped implementations:

- `LocalKeypairSigner` — in-memory (dev/tests, platform fee-payers).
- `RemoteSigner` — key lives in a `SignBackend`; signing is delegated, the key never enters the API.
- `SignBackend` — the custody contract (`getPublicKey(keyRef)`, `sign(keyRef, message)`), with an
  `InProcessVault` (reference) and an `HttpSignBackend` (client for the reference signer service,
  `src/signing/service.ts`, run via `pnpm --filter @stradebase/api signer`).
- `resolveSigner` (`src/signing/resolve.ts`) routes a write to a `RemoteSigner` (request carries
  `keyRef`, with `SIGNER_URL` set) or a `LocalKeypairSigner` (dev `secret`).

**Your work:** implement `SignBackend` against your **KMS/MPC provider** (Turnkey, Privy, Fireblocks,
Dfns, AWS KMS…) — or keep the HTTP contract and back the signer service with the provider. Resolve
`keyRef` from the **authenticated user server-side** (never trust a `keyRef` from the client). Add
signing **policy** (rate/amount/destination limits, anomaly detection) and an **audit log** at the
point marked in `service.ts::/sign`. Then separate and secure the platform authority keys:
- `ADMIN_SECRET_KEY` combines SBTS mint + freeze — split them, move behind custody / a multisig.
- Ops + compliance authorities → a multisig (e.g. Squads).
- Program **upgrade authority** → a timelocked multisig.

The whole royalty flow already runs in this mode end to end — `pnpm --filter @stradebase/api
signer-e2e` signs every step via `keyRef` against the reference signer service.

Prefer **MPC/TSS** over holding whole keys: the key is never assembled in one place, so a DB breach
yields nothing signable. It maps directly onto `TxSigner`.

### 2. Authentication / authorization

There is none here beyond rate limiting. Add real user auth (sessions/JWT), map an authenticated user
→ their `keyRef`, and authorize each action (e.g. only the artist can create their listing).

### 3. The money rail (net-new — biggest piece)

The chain records amounts; you build the actual **payment + payout + reconciliation** off-chain:
taking the buyer's funds, paying the artist, collecting the platform fee, and paying royalty holders.
Tie each settlement back to the on-chain record (by trade signature). **This is the only large piece
that doesn't exist anywhere in this repo.**

### 4. Persistence

- Indexer → **Postgres**: `PgStore` is ready — set `INDEXER_STORE=postgres` + `DATABASE_URL`,
  `pnpm --filter @stradebase/api add pg`. The DDL is created on boot (`PgStore.init`) and documented
  in `src/indexer/store.ts`.
- A **users table** for PII, the per-user **salt** (encrypted, never logged), `pii_version`, and a
  username mirror.
- `idempotency` / `cache` / rate-limit → **Redis** (same interfaces, swap the store).

### 5. Read-indexer at scale

For dashboards/history/portfolios, widen the indexer to serve balances/history/listings from Postgres
instead of live RPC, fed by a stream (Helius/Geyser) or webhooks. See [architecture.md](architecture.md) §6.

### 6. Ops

Paid RPC + failover, a write queue + worker fleet, monitoring/alerting, secrets management, CI/CD.

---

## Lift directly vs. don't touch

**Reuse as-is (don't rewrite):** the typed client (`@stradebase/onchain`), `tx/engine.ts`, the
`signing/` seam, `services/pii.ts`, `fx.ts`/`unified.ts`, the indexer core + `PgStore`, and the
endpoint contract.

**Do not change:** the on-chain programs and their IDs (bucket A). If a program change is ever needed,
it comes back to Josh → `anchor build` → re-sync the IDL.

## Quick reference

- Full technical picture → [architecture.md](architecture.md)
- Endpoint contract → [api.md](api.md), runnable in [api.http](api.http)
- Deploy + smoke-test on devnet → [devnet.md](devnet.md)
- Security & compliance model → [security.md](security.md)
- Test suites (all green): `anchor test`, and in `api/server`: `e2e`, `royalties-e2e`, `signer-e2e`,
  `indexer-test`, `pgstore-test`, `unified-test`, `pii`, `burst`.
