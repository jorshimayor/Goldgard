# Pyth FX & the Alchemy-backed indexer — backend setup

Two backend services that are **optional on devnet but required for production**: the live **Pyth**
GBP/USD rate behind the unified balance, and the **secondary-trade indexer** that reads the chain
through **Alchemy** (or any RPC) into a durable Postgres store. Both are config-only — the code paths
already exist. This is the setup guide for the backend team.

***

## 1. Pyth — the live GBP/USD rate

### Why

SBTS is GBP-pegged; USDC/USDT are USD-pegged; they are **not** 1:1. To show one unified balance in
SBTS (`GET /balances/:owner/unified`) the API converts USD holdings to GBP with a GBP/USD rate.
On devnet that rate is a fixed constant (`FX_GBP_USD`, default `1.27`) — deterministic, but it never
moves with the market. Production should use the live **Pyth** feed.

The rate is **indicative**: it *values* holdings, it is not a guaranteed executable swap rate.

### How it works

[`fx.ts`](../api/server/src/services/fx.ts) `gbpUsd()` fetches from **Pyth Hermes**, Pyth's free
public price REST service — a plain server-side HTTP GET, **no on-chain read, no wallet, no gas**:

```
GET https://hermes.pyth.network/v2/updates/price/latest?ids[]=<feedId>
→ { parsed: [ { price: { price, expo, publish_time } } ] }        # value = price × 10^expo
```

The result is cached for `FX_CACHE_TTL_MS` (60s), so Hermes is hit at most once a minute regardless
of traffic. A **staleness guard** rejects a price older than `FX_MAX_STALENESS_SEC` (120s) — a frozen
feed makes the endpoint fail loud rather than value holdings at a stale rate.

### Enable it

In `.env`:

```bash
FX_SOURCE=pyth
PYTH_GBPUSD_FEED_ID=0x84c2dde9633d93d1bcad84e7dc41c9d56578b7ec52fabedc1f335d673df0a7c1
FX_MAX_STALENESS_SEC=120
# PYTH_HERMES_URL defaults to https://hermes.pyth.network — leave unless self-hosting
```

Restart the API. The `rate` block in the unified-balance response flips from `fixed` to live:

```json
"rate": { "pair": "GBP/USD", "value": "1.33017", "source": "pyth", "asOf": 1785258544 }
```

### Verify the feed id before trusting it

Confirm the id is really GBP/USD (not a lookalike) at **pyth.network/price-feeds**, and sanity-check
the value straight from Hermes:

```bash
FEED=0x84c2dde9633d93d1bcad84e7dc41c9d56578b7ec52fabedc1f335d673df0a7c1
curl -s "https://hermes.pyth.network/v2/updates/price/latest?ids[]=$FEED" \
  | python3 -c "import sys,json,time;d=json.load(sys.stdin)['parsed'][0]['price'];print('GBP/USD',int(d['price'])*10**int(d['expo']),'age',int(time.time())-int(d['publish_time']),'s')"
```

Tests keep `FX_SOURCE=fixed` so they stay deterministic; switching to `pyth` only affects the running
server (`pnpm --filter @stradebase/api unified-test` is unaffected).

### Open product/legal item

Showing one combined balance implies convertibility. Whether to display the unified figure — or keep
per-token with the rate labelled "indicative" — is a product/legal decision, independent of source.

***

## 2. The secondary-trade indexer (via Alchemy)

### Why

Shares are real, transferable Token-2022 tokens. A **primary** sale writes an on-chain `TradeRecord`;
a **secondary** resale is just a token movement the program never records. The indexer closes that
gap: it walks each share mint's signature history, reconstructs owner→owner moves from token-balance
deltas, and persists them so resales are queryable in the same shape as primary trades — the DB
reflecting the chain. See [`indexer.ts`](../api/server/src/indexer/indexer.ts) and
[`core.ts`](../api/server/src/indexer/core.ts).

It also powers **reconciliation**: comparing reconstructed moves against on-chain `TradeRecord`s to
flag any transfer with no record.

### Alchemy is the RPC — nothing special required

The indexer uses standard Solana RPC (`getSignaturesForAddress`, `getTransaction`), so **any RPC
works**; Alchemy is just a reliable, rate-limit-friendly provider. Point the whole backend at your
Alchemy devnet/mainnet URL — the indexer reuses the API's configured connection:

```bash
SOLANA_RPC_URL=https://solana-devnet.g.alchemy.com/v2/<your-key>
```

That's the only Alchemy-specific setting. The public `api.devnet.solana.com` will rate-limit under
any real indexing load — use Alchemy (or Helius/Triton).

### Durable store: Postgres

In dev the store is in-memory (per-process) and the read endpoint indexes on-demand. Production needs
a **durable, shared** store so multiple API replicas and the worker see the same data:

```bash
INDEXER_STORE=postgres
DATABASE_URL=postgres://user:pass@host:5432/stradebase
```

Create the schema once (from [`store.ts`](../api/server/src/indexer/store.ts) — the `PgStore`
expects exactly this):

```sql
CREATE TABLE secondary_trades (
  signature      text   NOT NULL,
  log_index      int    NOT NULL DEFAULT 0,   -- nth share move within the tx
  mint           text   NOT NULL,
  listing        text   NOT NULL,
  seller         text   NOT NULL,
  buyer          text   NOT NULL,
  amount         bigint NOT NULL,             -- shares (0 decimals)
  slot           bigint NOT NULL,
  block_time     timestamptz,
  PRIMARY KEY (signature, log_index)          -- makes re-indexing idempotent
);
CREATE INDEX ON secondary_trades (listing, slot);
CREATE INDEX ON secondary_trades (buyer);
CREATE INDEX ON secondary_trades (seller);

CREATE TABLE indexer_cursors (
  mint           text PRIMARY KEY,
  last_signature text NOT NULL               -- newest signature already processed
);
```

Indexing is **cursor-based and idempotent**: each mint's cursor advances only after older→newer
processing, and the `(signature, log_index)` primary key means re-running never duplicates rows.

### Run the worker

```bash
pnpm --filter @stradebase/api indexer         # long-lived poll loop
```

- Poll interval: `INDEXER_INTERVAL_MS` (default `5000`).
- Handles `SIGINT`/`SIGTERM` for clean shutdown.
- Run **one** worker per environment; the API replicas only read. Without the worker, the read
  endpoint still catches up on-demand — fine for dev, not for scale.

### Endpoints it serves

| Endpoint | Purpose |
|---|---|
| `GET /royalties/trades/:listing` | full ordered trade history (primary from chain + secondary from the indexer) |
| `GET /royalties/reconcile/:listing` | reconstructed moves vs. on-chain records; flags any transfer with no `TradeRecord` |

Test it end to end (needs a validator/cluster with both programs):

```bash
pnpm --filter @stradebase/api indexer-test    # secondary record + reconciliation
pnpm --filter @stradebase/api pgstore-test     # PgStore SQL/mapping (no DB needed — fake client)
```

### Cost

Indexing cost is **RPC calls, not gas** — reading the chain is free of on-chain fees. The variable is
your RPC plan: roughly one `getSignaturesForAddress` page (up to 1000 sigs) plus one `getTransaction`
per candidate signature, per mint, per catch-up. Alchemy's compute-unit pricing covers this
comfortably at devnet/early-mainnet volumes; the 60s FX cache and cursor-based incremental indexing
keep call counts low. Scale the poll interval and worker count with listing volume.

***

## 3. Environment summary

| Var | Default | Needed for |
|---|---|---|
| `SOLANA_RPC_URL` | `http://127.0.0.1:8899` | **set to your Alchemy URL** for the indexer + all RPC |
| `FX_SOURCE` | `fixed` | `pyth` for the live rate |
| `PYTH_GBPUSD_FEED_ID` | GBP/USD feed | verify on pyth.network/price-feeds |
| `FX_MAX_STALENESS_SEC` | `120` | reject stale Pyth prices |
| `FX_CACHE_TTL_MS` | `60000` | FX cache |
| `PYTH_HERMES_URL` | `https://hermes.pyth.network` | self-hosted Hermes only |
| `INDEXER_STORE` | `memory` | `postgres` in production |
| `DATABASE_URL` | — | required when `INDEXER_STORE=postgres` |
| `INDEXER_INTERVAL_MS` | `5000` | worker poll cadence |

See [api.md](api.md) for the full endpoint reference, [devnet.md](devnet.md) for the deploy/runbook,
and [backend-handover.md](backend-handover.md) for the rest of the production build-out.
