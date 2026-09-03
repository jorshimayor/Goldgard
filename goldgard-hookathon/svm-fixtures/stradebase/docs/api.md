# API reference

Every HTTP endpoint of `@stradebase/api` (`api/server`), covering **SBTS / USDC / USDT tokens**,
**NFTs**, and **royalty shares**. Pair this with [api.http](api.http) for runnable requests and
[devnet.md](devnet.md) to deploy + test on a cluster.

- Base URL: `http://localhost:8080` (set `PORT` to change).
- All bodies are JSON; all responses are JSON, with bigints rendered as strings.
- Token amounts are **decimal UI strings** (`"12.34"`); the server converts to base units. Royalty
  amounts are **base/minor units** (see the royalty notes).
- Errors: `{ "error": "message" }` with a `4xx`/`5xx` status.
- **Resilience:** all writes go through a transaction engine (fee-payer pool, priority fees,
  fresh-blockhash retry). Send an **`Idempotency-Key`** header on writes so a retried request returns
  the original result instead of a second on-chain effect. Under saturation the server sheds load
  with `429`. `GET /health` returns engine stats.

## Prerequisites

1. Run the server: `pnpm --filter @stradebase/api dev` with `.env` set (`SBTS_MINT`,
   `ADMIN_SECRET_KEY`, RPC, and `USDT_MINT`). Full setup: [devnet.md](devnet.md).
2. **Tokens/NFTs** work as soon as the server is up (NFT minting needs the Metaplex Core program on
   the cluster — present on devnet/mainnet).
3. **Royalties** additionally require the two programs deployed and `GlobalConfig` initialized
   (`POST /royalties/init`, once).

## Roles

Three distinct identities show up across the API. Getting them right avoids "authority" errors.

| Role | Which key | What it is | Signs |
|---|---|---|---|
| **deployer** | the program **upgrade authority** (`~/.config/solana/id.json` on devnet) | bootstraps the platform; the `init` signer becomes the **ops authority** | `POST /royalties/init`, and the ops-gated writes: `/royalties/distribute`, `/royalties/admin/listing-status`, `/royalties/admin/pause`, `/royalties/admin/fee` |
| **admin** | the server's `ADMIN_SECRET_KEY` (e.g. `admin.json`) | the platform **custodial key**: SBTS **mint + freeze** authority, the **compliance authority**, and the **treasury** | token ops (`/mint` server-side, `/admin/freeze`\|`/thaw`, treasury `/transfer`) and royalty **compliance**: `/royalties/identity`, `/pii`, `/admin/block`\|`/unblock`\|`/compliance`, `/hook-metas` |
| **users** (owner / artist / buyer / …) | ordinary end-user wallets (custodial in production) | the people who list, buy, hold, and resell | their own actions: `/royalties/profile`, `/username`, `/listings` (artist), `/buy` (buyer), `/transfer` (seller) |

Two wiring rules that follow from this:
- **`init` must be signed by the deployer** (the upgrade authority), and its `complianceAuthority` +
  `treasury` should be set to the **admin** wallet — because the admin key is what signs the
  compliance calls afterward (they're checked with `has_one = compliance_authority`).
- The **ops authority is whoever signed `init`** (the deployer). So the ops writes above must be
  signed by the deployer, not the admin.

In `api.http` these map to `@deployerSecret`, `@admin`/`@adminSecret`, and the per-user `…Secret`
variables. On devnet the deployer is your `~/.config/solana/id.json` and the admin is `admin.json`.

## Signing model

- **Token & NFT mint/freeze** are signed by the server's `ADMIN_SECRET_KEY` (the admin role above).
- **`POST /transfer`** optionally takes `fromSecret` to send on a user's behalf; omit it to send from
  the treasury (admin).
- **Every** **`/royalties/*`** **write** is authorized by a signer given as **either** `secret` (a JSON
  secret-key array — dev/testing) **or** `keyRef` (an opaque custody handle, when `SIGNER_URL` is
  set, the raw key stays in the custody service and never transits HTTP). The two are interchangeable
  on every write. Custody is the production path, see [backend-handover.md](backend-handover.md).

***

## Health & discovery

### `GET /health`

```json
{ "ok": true, "engine": { "active": 0, "queued": 0, "feePayers": 1 } }
```

### `GET /tokens`

Catalogue of supported tokens with capability flags.

```json
[
  { "symbol": "SBTS", "name": "Stradebase GBP Stablecoin", "mint": "…", "decimals": 9,
    "pegCurrency": "GBP", "program": "TokenzQdBN…", "mintable": true, "freezable": true },
  { "symbol": "USDC", "…": "…", "mintable": false, "freezable": false },
  { "symbol": "USDT", "…": "…", "mintable": false, "freezable": false }
]
```

***

## Balances

### `GET /balances/:owner`

All three balances for a wallet (a missing account reads as zero, never an error).

```json
[
  { "symbol": "SBTS", "mint": "…", "tokenAccount": "…", "exists": true, "raw": "150250000000", "ui": "150.25", "decimals": 9 },
  { "symbol": "USDC", "…": "…", "ui": "42.1" },
  { "symbol": "USDT", "…": "…", "exists": false, "ui": "0" }
]
```

### `GET /balances/:owner/unified`

A single **SBTS (GBP)** figure across all the wallet's tokens. USD stablecoins are converted at
GBP/USD; **all decimals, conversion, and formatting are done server-side** — the frontend renders the
strings. Indicative (values holdings; not a guaranteed swap rate).

```json
{
  "owner": "<wallet>",
  "quote": "SBTS",
  "total": "160.87",            // 2dp, plain
  "display": "1,160.87",        // 2dp, grouped for display
  "rate": { "pair": "GBP/USD", "value": "1.27", "source": "fixed", "asOf": 1721900000 },
  "breakdown": [
    { "symbol": "SBTS", "amount": "90", "inSbts": "90.00", "inSbtsDisplay": "90.00" },
    { "symbol": "USDC", "amount": "45", "inSbts": "35.43", "inSbtsDisplay": "35.43" },
    { "symbol": "USDT", "amount": "45", "inSbts": "35.43", "inSbtsDisplay": "35.43" }
  ]
}
```

Rate source is config-driven: `FX_SOURCE=fixed` (constant `FX_GBP_USD`, default) or `pyth` (live Pyth
GBP/USD via Hermes), cached for `FX_CACHE_TTL_MS`. Show `rate.asOf`/`rate.source` in the UI so a stale
rate is visible.

### `GET /balances/:owner/:symbol`

One token balance (same shape as an element of `GET /balances/:owner`). `symbol` ∈ `SBTS | USDC | USDT`.

***

## Tokens

### `POST /mint`

Mint **SBTS** to a wallet (admin = mint authority). SBTS only.

```json
// request
{ "to": "<wallet>", "amount": "100" }
// 201
{ "signature": "…", "symbol": "SBTS", "to": "<wallet>", "amount": "100", "tokenAccount": "<ata>" }
```

### `POST /transfer`

Transfer any supported token. Idempotent recipient-account creation + `transferChecked` under the hood.

```json
// request — omit fromSecret to send from the treasury
{ "to": "<wallet>", "symbol": "USDC", "amount": "5.5", "fromSecret": [12,34,...] }
// 201
{ "signature": "…", "symbol": "USDC", "from": "<sender>", "to": "<wallet>", "amount": "5.5" }
```

***

## Transaction history

### `GET /history/:owner`

Combined SBTS + USDC + USDT activity, newest first. `?limit=` (default 20).

```json
[
  { "signature": "…", "slot": 123, "blockTime": 1720000000, "symbol": "SBTS", "mint": "…",
    "owner": "…", "tokenAccount": "…", "rawChange": "-2500000000", "uiChange": "-2.5",
    "decimals": 9, "failed": false }
]
```

### `GET /history/:owner/:symbol`

One token's history. `?limit=` and `?before=<signature>` for pagination.

***

## Admin — token freeze

Only **SBTS** (and platform NFTs) can be frozen — the platform holds their freeze authority. Freezing
USDC/USDT returns `400`.

### `POST /admin/freeze` · `POST /admin/thaw`

```json
// request
{ "owner": "<wallet>", "symbol": "SBTS" }
// 201
{ "signature": "…", "symbol": "SBTS", "owner": "<wallet>", "tokenAccount": "<ata>", "frozen": true }
```

***

## Bulk distribution (sale / drop)

The parallelizable way to hand SBTS to many wallets at once: **pre-mint once** into a pool of source
accounts, then **transfer** in parallel (rotating source + fee payer). Needs `FEE_PAYER_SECRETS` set
for real parallelism.

### `POST /distribute/prefund`

One-time before a sale: mint `amountEach` SBTS into every pool source account.

```json
{ "amountEach": "100000" }
// 201 → { "sbtsMint": "…", "sources": 4, "pool": [ { "source": "…", "tokenAccount": "…", "signature": "…" }, … ] }
```

### `POST /distribute`

Pay out to many recipients concurrently; one failure never fails the batch.

```json
{ "recipients": [ { "to": "<wallet>", "amount": "5" }, { "to": "<wallet>", "amount": "10" } ] }
// 201 → { "total": 2, "succeeded": 2, "results": [ { "to": "…", "amount": "5", "source": "…", "signature": "…", "ok": true }, … ] }
```

***

## NFTs (Metaplex Core)

### `POST /nfts/collection`

```json
{ "name": "Stradebase Tiers", "uri": "https://…/collection.json" }
// 201 → { "signature": "…", "collection": "<address>" }
```

### `POST /nfts/mint`

Mint a Core NFT (optionally into a collection, optionally to an owner). Adds a freeze delegate so the
platform can freeze it.

```json
{ "name": "Gold Season 1", "uri": "https://…/gold1.json", "owner": "<wallet>", "collection": "<address>" }
// 201 → { "signature": "…", "asset": "<address>" }
```

### `GET /nfts/:asset`

```json
{ "asset": "…", "name": "Gold Season 1", "uri": "https://…", "owner": "…", "collection": "…", "frozen": false }
```

### `POST /admin/nft/freeze` · `POST /admin/nft/thaw`

```json
{ "asset": "<address>", "collection": "<address?>" }   // 201 → { "signature": "…" }
```

***

## Royalty shares

Fractional royalty ownership on the `royalty_shares` program. Reads are open; every write is
authorized by `secret` or `keyRef` (see Signing model).

> **This program moves no money.** Writes issue/move the *share* token and record the economic events
> (amounts stored as data); payment and payouts settle off-chain. `POST /royalties/buy` mints shares
> and records the trade but transfers no SBTS; `POST /royalties/distribute` records a payout the
> platform made off-chain. See [architecture.md](architecture.md).

### Reads

| Endpoint                                | Returns                                                                      |
| --------------------------------------- | ---------------------------------------------------------------------------- |
| `GET /royalties/config`                 | the singleton `GlobalConfig`                                                 |
| `GET /royalties/listings`               | all listings (each with its `address`)                                       |
| `GET /royalties/listings/:listing`      | one listing                                                                  |
| `GET /royalties/identity/:user`         | a wallet's KYC record (status + `piiCommitment` + version; no personal data) |
| `GET /royalties/profile/:user`          | a wallet's platform profile (role, username, counters)                       |
| `GET /royalties/username/:name`         | who owns a username, or `null` if unclaimed                                  |
| `GET /royalties/positions/:mint/:owner` | a holder's position (lock-up unlock time)                                    |
| `GET /royalties/distributions/:listing` | recorded royalty distributions (payouts made off-chain)                      |
| `GET /royalties/trades/:listing`        | authoritative on-chain history: primary + secondary trades, ordered          |
| `GET /royalties/reconcile/:listing`     | audit net: share moves with no on-chain trade record (should be empty)       |

#### Read response shapes

Field conventions for all reads below: large integers (`u64`/`i64` — amounts, shares, times) come
back as **strings**; small ints (`u8`/`u16` — levels, bps, bumps) as **numbers**; addresses as
**base58 strings**; fixed byte arrays (`songId`, `piiCommitment`, `merkleRoot`, `reference`) as
**number arrays**; enums as **`{ variant: {} }`**; an unset `Option` as **`null`**.

```json
// GET /royalties/config  → the singleton GlobalConfig
{ "authority": "<ops>", "complianceAuthority": "<admin>", "treasury": "<admin>",
  "sbstMint": "<SBTS mint>", "platformFeeBps": 200, "maxGlobalOwnershipBps": 10000,
  "isPaused": false, "bump": 254 }
```
```json
// GET /royalties/listings  → array; GET /royalties/listings/:listing → one (no `address`)
[{ "address": "<listing pda>", "artist": "<wallet>", "songId": [/* 32 bytes */],
   "metadataUri": "https://…/song.json", "totalShares": "1000", "sharesMinted": "10",
   "pricePerShare": "1000000000", "royaltyPercentSold": 0, "artistRetainedPercent": 0,
   "startTime": "0", "endTime": null, "status": { "active": {} }, "shareMint": "<mint>",
   "lockupSeconds": "0", "requiresAccredited": false, "allowedJurisdictions": [],
   "cumulativeRoyalties": "10000000000", "totalDistributions": "1", "totalTrades": "2", "bump": 255 }]
```
```json
// GET /royalties/identity/:user  → KYC record; NO personal data (only the commitment)
{ "user": "<wallet>", "kycLevel": 2, "jurisdiction": [71, 66], /* ISO bytes "GB" */
  "status": { "ok": {} }, /* ok | restricted | frozen */ "accredited": true,
  "piiCommitment": [/* 32 bytes */], "piiVersion": 2, "commitmentScheme": 1,
  "lastVerified": "1721900000", "bump": 253 }
```
```json
// GET /royalties/profile/:user  → platform profile
{ "user": "<wallet>", "username": "ada_l", /* "" if none */ "role": { "both": {} },
  "createdAt": "1721900000", "listingsCreated": "1", "tradesCount": "3", "bump": 252 }
```
```json
// GET /royalties/username/:name  → owner + claim record, or null if unclaimed
{ "username": "ada_l", "record": "<pda>", "owner": "<wallet>", "claimedAt": "1721900000", "bump": 251 }
```
```json
// GET /royalties/positions/:mint/:owner  → a holder's lock-up position
{ "owner": "<wallet>", "shareMint": "<mint>", "unlockTime": "1721990000", "bump": 250 }
```
```json
// GET /royalties/distributions/:listing  → recorded off-chain payouts, ordered by index
[{ "address": "<pda>", "listing": "<listing>", "index": "0", "totalAmount": "10000000000",
   "merkleRoot": [/* 32 bytes, all-zero if none */], "timestamp": "1721900000",
   "reference": [/* 64 bytes: the off-chain batch id */], "bump": 249 }]
```
```json
// GET /royalties/trades/:listing  → full primary→secondary history, oldest first
[{ "kind": "primary",   "seller": "<artist/listing>", "buyer": "<wallet>", "shares": "10", "settlementAmount": "10000000000", "timestamp": 1721900000 },
 { "kind": "secondary", "seller": "<wallet>",         "buyer": "<wallet>", "shares": "3",  "settlementAmount": "3000000000",  "timestamp": 1721900500 }]
```
```json
// GET /royalties/reconcile/:listing  → audit net; `unrecorded` should be empty
{ "rawMoves": 1, "onchainSecondary": 1, "unrecorded": [
  /* any share move with no matching on-chain record, e.g.: */
  { "signature": "…", "logIndex": 0, "mint": "<mint>", "listing": "<listing>",
    "seller": "<wallet>", "buyer": "<wallet>", "amount": "3", "slot": 123, "blockTime": 1721900500 } ] }
```

### Writes

The "Signer" column names the *role* that must authorize (via `secret` or `keyRef`).

| Endpoint                                   | Signer                             | Body (besides the signer)                                                                                                                                                                                                   |
| ------------------------------------------ | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /royalties/init`                     | upgrade authority                  | `complianceAuthority`, `treasury`, `platformFeeBps?`, `maxGlobalOwnershipBps?`                                                                                                                                              |
| `POST /royalties/identity`                 | compliance authority               | `user`, `kycLevel?`, `jurisdiction?`, `status?` (`ok`/`restricted`/`frozen`), `accredited?`, `pii?` **or** `piiCommitment?`                                                                                                 |
| `POST /royalties/pii`                      | compliance authority               | `user`, `pii` **or** `piiCommitment`                                                                                                                                                                                        |
| `POST /royalties/username`                 | the user (rent via `payerSecret?`) | `username` (`[a-z0-9_]{3,32}`)                                                                                                                                                                                              |
| `POST /royalties/username/release`         | the name's owner                   | `username`                                                                                                                                                                                                                  |
| `POST /royalties/profile`                  | the user (rent via `payerSecret?`) | `role` (`investor`/`artist`/`both`)                                                                                                                                                                                         |
| `POST /royalties/profile/role`             | the profile owner                  | `role`                                                                                                                                                                                                                      |
| `POST /royalties/listings`                 | artist                             | `songId`, `metadataUri`, `totalShares`, `pricePerShare`, `royaltyPercentSold?`, `artistRetainedPercent?`, `startTime?`, `endTime?`, `lockupSeconds?`, `requiresAccredited?`, `allowedJurisdictions?`, `maxSharesPerWallet?` |
| `POST /royalties/hook-metas`               | any funded wallet                  | `shareMint`                                                                                                                                                                                                                 |
| `POST /royalties/buy`                      | buyer                              | `listing`, `shares`, `settlementAmount?` (recorded), `paymentTxHash?`                                                                                                                                                       |
| `POST /royalties/transfer`                 | seller                             | `listing`, `buyer`, `shares`, `settlementAmount?`, `paymentTxHash?` — secondary sale: moves shares + writes the trade record atomically                                                                                     |
| `POST /royalties/distribute`               | ops authority                      | `listing`, `totalAmount`, `merkleRoot?` (base64, 32 bytes), `reference?`                                                                                                                                                    |
| `POST /royalties/admin/block` · `/unblock` | compliance authority               | `shareMint`, `user`                                                                                                                                                                                                         |
| `POST /royalties/admin/compliance`         | compliance authority               | `shareMint`, `maxSharesPerWallet`                                                                                                                                                                                           |
| `POST /royalties/admin/listing-status`     | ops authority                      | `listing`, `status` (`active`/`paused`/`closed`/…)                                                                                                                                                                          |
| `POST /royalties/admin/pause`              | ops authority                      | `paused` (bool)                                                                                                                                                                                                             |
| `POST /royalties/admin/fee`                | ops authority                      | `platformFeeBps` (0–10000)                                                                                                                                                                                                  |

#### Write responses

Every write returns `201` with at least a `signature` (the on-chain transaction id). The full shapes:

| Endpoint | Returns |
|---|---|
| `POST /royalties/init` | `{ signature, globalConfig }` |
| `POST /royalties/identity` | `{ signature, identity, salt, piiCommitment }` — `salt`+`piiCommitment` base64; **store `salt`** |
| `POST /royalties/pii` | `{ signature, salt?, piiCommitment }` — `salt` only when `pii` was supplied |
| `POST /royalties/profile` | `{ signature, profile, user, role }` |
| `POST /royalties/profile/role` | `{ signature, role }` |
| `POST /royalties/username` | `{ signature, username, record }` |
| `POST /royalties/username/release` | `{ signature, username }` |
| `POST /royalties/listings` | `{ signature, listing, shareMint }` — **save both** |
| `POST /royalties/hook-metas` | `{ signature, extraAccountMetaList }` |
| `POST /royalties/buy` | `{ signature, shares, buyer }` |
| `POST /royalties/transfer` | `{ signature, listing, seller, buyer, shares }` |
| `POST /royalties/distribute` | `{ signature, distribution, index }` |
| `POST /royalties/admin/block` · `/unblock` · `/compliance` | `{ signature }` |
| `POST /royalties/admin/listing-status` · `/pause` | `{ signature }` |
| `POST /royalties/admin/fee` | `{ signature, platformFeeBps }` |

Notes:

- **Personal data never goes on-chain.** Pass the full record as `pii`; the server hashes it and
  stores only the 32-byte commitment on-chain. The response returns `salt` **once** — store it
  encrypted against the user row alongside the exact `pii` object. Losing the salt makes the
  commitment unverifiable; leaking it makes the PII brute-forceable; deleting it satisfies a
  right-to-erasure request.
- **Compliance status is reason-free.** `restricted` may hold and receive but not buy or send;
  `frozen` blocks everything. The reason for a designation stays in your case file.
- **Usernames are public and opt-in** — a handle tied to an address exposes that wallet's trading
  history, so it needs the user's own signature. Uniqueness is enforced on-chain.
- **Every wallet needs a profile before it can act** (`POST /royalties/profile` at signup). Only
  `artist`/`both` may create listings.
- `songId` is any string (hashed to 32 bytes); the response returns the derived `listing` +
  `shareMint` — save them for later calls.
- `pricePerShare`, `settlementAmount`, `totalAmount`, `totalShares`, `maxSharesPerWallet` are base/
  minor units (SBTS has 9 decimals → `1_000_000_000` = 1 SBTS; shares are 0 decimals). Amounts are
  recorded as data — no on-chain transfer backs them.
- `jurisdiction` / `allowedJurisdictions` use ISO alpha-2 strings (`"GB"`, `["GB","US"]`).
- `POST /royalties/hook-metas` must run once per share mint before secondary transfers.

### Example — buy (issues shares, records the off-chain settlement)

```json
// POST /royalties/buy
{ "secret": [/* buyer secret key */], "listing": "<listing>", "shares": 10, "settlementAmount": 10000000000 }
// 201 → { "signature": "…", "shares": "10", "buyer": "<buyer>" }
```

### Example — secondary sale (moves shares + records the trade)

```json
// POST /royalties/transfer
{ "secret": [/* seller secret key */], "listing": "<listing>", "buyer": "<wallet>", "shares": 3, "settlementAmount": 3000000000 }
// 201 → { "signature": "…", "seller": "…", "buyer": "…", "shares": "3" }
```

### Example — distribute (records a payout made off-chain)

```json
// POST /royalties/distribute
{ "secret": [/* ops authority secret key */], "listing": "<listing>", "totalAmount": 10000000000, "reference": "batch-2026-07" }
// 201 → { "signature": "…", "distribution": "<pda>", "index": "0" }
```

