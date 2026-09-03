import "dotenv/config";
import { Keypair, PublicKey } from "@solana/web3.js";
import type { Cluster } from "@stradebase/blockchain";

/** Fail fast at boot with a clear message rather than a cryptic error later. */
function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

function keypairFromEnv(name: string): Keypair {
  try {
    return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(required(name))));
  } catch {
    throw new Error(`${name} must be a JSON secret-key array, e.g. [12,34,...]`);
  }
}

function pubkeyFromEnv(name: string): PublicKey {
  const v = required(name);
  try {
    return new PublicKey(v);
  } catch {
    throw new Error(
      `${name} must be a base58 mint address, got "${v}". ` +
        `Set it in api/server/.env (replace the .env.example placeholder). ` +
        `Create one with: solana-keygen new -o sbts-mint.json && ` +
        `spl-token create-token --program-2022 --decimals 9 sbts-mint.json`,
    );
  }
}

/**
 * Parse an optional pool of fee-payer secret keys: a JSON array-of-arrays,
 * e.g. `[[1,2,...],[3,4,...]]`. Falls back to `[fallback]` when unset.
 */
function keypairPool(name: string, fallback: Keypair): Keypair[] {
  const raw = process.env[name];
  if (!raw) return [fallback];
  try {
    const arrs = JSON.parse(raw) as number[][];
    if (!Array.isArray(arrs) || arrs.length === 0) return [fallback];
    return arrs.map((a) => Keypair.fromSecretKey(Uint8Array.from(a)));
  } catch {
    throw new Error(`${name} must be a JSON array of secret-key arrays, e.g. [[1,2,...],[3,4,...]]`);
  }
}

const num = (name: string, def: number) => {
  const v = process.env[name];
  return v == null || v === "" ? def : Number(v);
};

const admin = keypairFromEnv("ADMIN_SECRET_KEY");

/**
 * Validated runtime configuration. Loaded once at startup; if anything is missing or
 * malformed the process exits before serving a request.
 */
export const config = {
  rpcUrl: process.env.SOLANA_RPC_URL ?? "http://127.0.0.1:8899",
  cluster: (process.env.CLUSTER ?? "devnet") as Cluster,
  port: Number(process.env.PORT ?? 8080),

  /** The GBP-pegged SBTS stablecoin (Token-2022) this platform mints. */
  sbtsMint: pubkeyFromEnv("SBTS_MINT"),
  sbtsDecimals: Number(process.env.SBTS_DECIMALS ?? 9),

  /** Optional mint overrides for the stablecoins we accept. */
  usdcMint: process.env.USDC_MINT,
  usdtMint: process.env.USDT_MINT,

  /** Custodial key: SBTS mint authority + freeze authority + fee/rent payer. */
  admin,

  // -------- scale / resilience knobs (safe defaults for local dev) --------
  /** Pool of fee-payer keypairs rotated per transaction so no single payer account
   *  becomes a write-lock hotspot during a burst. Defaults to `[admin]`. */
  feePayers: keypairPool("FEE_PAYER_SECRETS", admin),
  /** Priority fee (micro-lamports per compute unit) to help land under congestion. */
  priorityFeeMicroLamports: num("PRIORITY_FEE_MICROLAMPORTS", 5_000),
  /** Compute-unit limit set on each tx (keeps priority-fee cost bounded). */
  computeUnitLimit: num("COMPUTE_UNIT_LIMIT", 200_000),
  /** Max in-flight submissions; excess queues, and 429s past `maxQueue`. */
  maxConcurrency: num("MAX_CONCURRENCY", 24),
  maxQueue: num("MAX_QUEUE", 2_000),
  /** Send retry attempts on transient failures (blockhash expiry, timeouts). */
  sendMaxRetries: num("SEND_MAX_RETRIES", 4),
  /** TTL (ms) for cached balance/history reads to shed RPC load. */
  readCacheTtlMs: num("READ_CACHE_TTL_MS", 3_000),
  /** Per-IP request budget per window (basic abuse protection). */
  rateLimitPerMin: num("RATE_LIMIT_PER_MIN", 600),

  // -------- indexer store --------
  /** `memory` (default, per-process) or `postgres` (durable, shared across replicas). */
  indexerStore: (process.env.INDEXER_STORE ?? "memory") as "memory" | "postgres",
  /** Postgres connection string; required when `INDEXER_STORE=postgres`. */
  databaseUrl: process.env.DATABASE_URL,

  // -------- custody signing --------
  /** URL of the custody signer service; required to sign via `keyRef` (KMS/MPC in production). */
  signerUrl: process.env.SIGNER_URL,

  // -------- FX (unified SBTS balance) --------
  /** GBP/USD source: `fixed` (constant below) or `pyth` (live Hermes feed). */
  fxSource: (process.env.FX_SOURCE ?? "fixed") as "fixed" | "pyth",
  /** Fixed GBP/USD (1 GBP = this many USD) used when `FX_SOURCE=fixed`. */
  fxGbpUsd: Number(process.env.FX_GBP_USD ?? 1.27),
  /** Cache TTL for the FX rate. */
  fxCacheTtlMs: num("FX_CACHE_TTL_MS", 60_000),
  /** Reject a live (Pyth) rate whose publish time is older than this many seconds. Guards
   *  against a frozen/stale feed being served silently. Ignored for the `fixed` source. */
  fxMaxStalenessSec: num("FX_MAX_STALENESS_SEC", 120),
  pythHermesUrl: process.env.PYTH_HERMES_URL ?? "https://hermes.pyth.network",
  /** Pyth GBP/USD price-feed id — verify against pyth.network/price-feeds. */
  pythGbpUsdFeedId:
    process.env.PYTH_GBPUSD_FEED_ID ??
    "0x84c2dde9633d93d1bcad84e7dc41c9d56578b7ec52fabedc1f335d673df0a7c1",
} as const;
