/**
 * Indexer persistence — the store that secondary-trade records and per-mint cursors live in.
 *
 * The chain is the ledger of record; the indexer's job is to turn the raw on-chain share
 * *movements* (Token-2022 transfers the program itself doesn't write a `TradeRecord` for)
 * into the same structured, queryable shape as primary trades — i.e. to make the DB reflect
 * what happened on-chain. See `docs/architecture.md`.
 *
 * The interface is deliberately tiny so production can swap the in-memory store for Postgres
 * without touching the indexer core. The Postgres DDL that satisfies this contract:
 *
 * ```sql
 * CREATE TABLE secondary_trades (
 *   signature   text        NOT NULL,
 *   log_index   int         NOT NULL DEFAULT 0,   -- nth share move within the tx
 *   mint        text        NOT NULL,
 *   listing     text        NOT NULL,
 *   seller      text        NOT NULL,
 *   buyer       text        NOT NULL,
 *   amount      bigint      NOT NULL,             -- shares (0 decimals)
 *   slot        bigint      NOT NULL,
 *   block_time  timestamptz,
 *   PRIMARY KEY (signature, log_index)            -- idempotent re-indexing
 * );
 * CREATE INDEX ON secondary_trades (listing, slot);
 * CREATE INDEX ON secondary_trades (buyer);
 * CREATE INDEX ON secondary_trades (seller);
 *
 * CREATE TABLE indexer_cursors (
 *   mint        text PRIMARY KEY,
 *   last_signature text NOT NULL   -- newest signature already processed for this mint
 * );
 * ```
 */

import { config } from "../config.js";

/** A secondary-market share transfer, reconstructed from on-chain token-balance deltas. */
export interface SecondaryTrade {
  /** Transaction signature the move happened in. */
  signature: string;
  /** nth share move within that transaction (usually 0); part of the idempotency key. */
  logIndex: number;
  /** The share mint that moved. */
  mint: string;
  /** The listing the mint belongs to. */
  listing: string;
  /** Wallet that sent the shares. */
  seller: string;
  /** Wallet that received the shares. */
  buyer: string;
  /** Shares moved (base units; shares are indivisible / 0 decimals). */
  amount: string;
  slot: number;
  blockTime: number | null;
}

export interface TradeFilter {
  listing?: string;
  wallet?: string; // matches either side
}

/** Storage contract. `InMemoryStore` implements it; a Postgres adapter would too. */
export interface IndexerStore {
  /** Newest signature already processed for `mint`, or null if never indexed. */
  getCursor(mint: string): Promise<string | null>;
  setCursor(mint: string, signature: string): Promise<void>;
  /** Idempotent on `(signature, logIndex)` — re-indexing a range never double-counts. */
  upsertTrade(trade: SecondaryTrade): Promise<void>;
  listTrades(filter?: TradeFilter): Promise<SecondaryTrade[]>;
}

/** Process-local store. Fine for a single API process and for tests; swap for Postgres at scale. */
export class InMemoryStore implements IndexerStore {
  private cursors = new Map<string, string>();
  private trades = new Map<string, SecondaryTrade>(); // key: `${signature}:${logIndex}`

  async getCursor(mint: string) {
    return this.cursors.get(mint) ?? null;
  }
  async setCursor(mint: string, signature: string) {
    this.cursors.set(mint, signature);
  }
  async upsertTrade(t: SecondaryTrade) {
    this.trades.set(`${t.signature}:${t.logIndex}`, t);
  }
  async listTrades(filter: TradeFilter = {}) {
    let out = [...this.trades.values()];
    if (filter.listing) out = out.filter((t) => t.listing === filter.listing);
    if (filter.wallet) out = out.filter((t) => t.seller === filter.wallet || t.buyer === filter.wallet);
    return out.sort((a, b) => a.slot - b.slot || a.logIndex - b.logIndex);
  }
}

// ---------------- Postgres store ----------------

/**
 * The subset of a `pg` `Pool`/`Client` we use. Typed structurally so this module does **not**
 * hard-depend on the `pg` package — production injects a real `Pool`; tests inject a fake.
 */
export interface Queryable {
  query(text: string, params?: any[]): Promise<{ rows: any[] }>;
}

/** Idempotent schema — matches the DDL documented at the top of this file. */
const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS secondary_trades (
  signature   text        NOT NULL,
  log_index   int         NOT NULL DEFAULT 0,
  mint        text        NOT NULL,
  listing     text        NOT NULL,
  seller      text        NOT NULL,
  buyer       text        NOT NULL,
  amount      bigint      NOT NULL,
  slot        bigint      NOT NULL,
  block_time  timestamptz,
  PRIMARY KEY (signature, log_index)
);
CREATE INDEX IF NOT EXISTS secondary_trades_listing_slot ON secondary_trades (listing, slot);
CREATE INDEX IF NOT EXISTS secondary_trades_buyer ON secondary_trades (buyer);
CREATE INDEX IF NOT EXISTS secondary_trades_seller ON secondary_trades (seller);
CREATE TABLE IF NOT EXISTS indexer_cursors (
  mint           text PRIMARY KEY,
  last_signature text NOT NULL
);
`;

/** Durable store backed by Postgres. Survives restarts and is shared across API/worker replicas. */
export class PgStore implements IndexerStore {
  constructor(private readonly db: Queryable) {}

  /** Create the tables if they don't exist. Safe to call on every boot. */
  async init(): Promise<void> {
    await this.db.query(SCHEMA_SQL);
  }

  async getCursor(mint: string) {
    const { rows } = await this.db.query("SELECT last_signature FROM indexer_cursors WHERE mint = $1", [mint]);
    return rows[0]?.last_signature ?? null;
  }

  async setCursor(mint: string, signature: string) {
    await this.db.query(
      `INSERT INTO indexer_cursors (mint, last_signature) VALUES ($1, $2)
       ON CONFLICT (mint) DO UPDATE SET last_signature = EXCLUDED.last_signature`,
      [mint, signature],
    );
  }

  async upsertTrade(t: SecondaryTrade) {
    await this.db.query(
      `INSERT INTO secondary_trades (signature, log_index, mint, listing, seller, buyer, amount, slot, block_time)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CASE WHEN $9::double precision IS NULL THEN NULL ELSE to_timestamp($9::double precision) END)
       ON CONFLICT (signature, log_index) DO NOTHING`,
      [t.signature, t.logIndex, t.mint, t.listing, t.seller, t.buyer, t.amount, t.slot, t.blockTime],
    );
  }

  async listTrades(filter: TradeFilter = {}) {
    const where: string[] = [];
    const params: any[] = [];
    if (filter.listing) { params.push(filter.listing); where.push(`listing = $${params.length}`); }
    if (filter.wallet) { params.push(filter.wallet); where.push(`(seller = $${params.length} OR buyer = $${params.length})`); }
    const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const { rows } = await this.db.query(
      `SELECT signature, log_index, mint, listing, seller, buyer, amount::text AS amount, slot,
              EXTRACT(EPOCH FROM block_time)::bigint AS block_time
       FROM secondary_trades ${clause}
       ORDER BY slot ASC, log_index ASC`,
      params,
    );
    return rows.map((r): SecondaryTrade => ({
      signature: r.signature,
      logIndex: Number(r.log_index),
      mint: r.mint,
      listing: r.listing,
      seller: r.seller,
      buyer: r.buyer,
      amount: String(r.amount),
      slot: Number(r.slot),
      blockTime: r.block_time == null ? null : Number(r.block_time),
    }));
  }
}

// ---------------- store selection ----------------

/**
 * Build a `PgStore` from a connection string, dynamically importing `pg` so it's an **optional**
 * dependency (only needed when `INDEXER_STORE=postgres`). Install it with
 * `pnpm --filter @stradebase/api add pg`.
 */
export async function createPgStore(connectionString: string): Promise<PgStore> {
  const pkg = "pg"; // non-literal specifier keeps `pg` out of the static type graph
  let Pool: new (cfg: { connectionString: string }) => Queryable;
  try {
    ({ Pool } = (await import(pkg)) as any);
  } catch {
    throw new Error("INDEXER_STORE=postgres needs the 'pg' package — run: pnpm --filter @stradebase/api add pg");
  }
  const store = new PgStore(new Pool({ connectionString }));
  await store.init();
  return store;
}

let storePromise: Promise<IndexerStore> | null = null;

/**
 * The process-wide indexer store, chosen once from config. Async because Postgres needs a connect +
 * schema step. `INDEXER_STORE=postgres` (+ `DATABASE_URL`) selects Postgres; anything else uses the
 * in-memory store. Memoized so every caller shares one instance.
 */
export function getStore(): Promise<IndexerStore> {
  if (!storePromise) {
    storePromise = (async () => {
      if (config.indexerStore === "postgres") {
        if (!config.databaseUrl) throw new Error("INDEXER_STORE=postgres requires DATABASE_URL");
        return createPgStore(config.databaseUrl);
      }
      return new InMemoryStore();
    })();
  }
  return storePromise;
}
