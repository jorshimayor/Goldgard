/**
 * GBP/USD FX rate — needed to express USD stablecoins (USDC/USDT) in GBP-pegged SBTS.
 *
 * SBTS is GBP-pegged; USDC/USDT are USD-pegged; they are NOT 1:1. To sum them into one SBTS figure
 * we convert USD → GBP with this rate. Two sources, chosen by config, both cached:
 *   - `fixed`  — a configured constant (`FX_GBP_USD`). Deterministic; used by default and in tests.
 *   - `pyth`   — the live Pyth GBP/USD feed via the Hermes REST API (server-side; no on-chain read).
 *
 * The rate is **indicative** — it values holdings, it is not a guaranteed executable swap rate.
 */
import { config } from "../config.js";

export interface FxRate {
  pair: "GBP/USD";
  /** Value of the pair: 1 GBP = `value` USD. */
  value: string;
  source: "fixed" | "pyth";
  /** Unix seconds the rate was observed/published. */
  asOf: number;
}

let cache: { rate: FxRate; expires: number } | null = null;

/** Current GBP/USD, cached for `FX_CACHE_TTL_MS`. */
export async function gbpUsd(now = Date.now()): Promise<FxRate> {
  if (cache && cache.expires > now) return cache.rate;
  const rate = config.fxSource === "pyth" ? await fetchPyth(now) : fixedRate(now);
  cache = { rate, expires: now + config.fxCacheTtlMs };
  return rate;
}

function fixedRate(now: number): FxRate {
  return { pair: "GBP/USD", value: String(config.fxGbpUsd), source: "fixed", asOf: Math.floor(now / 1000) };
}

/**
 * Pyth Hermes: `GET /v2/updates/price/latest?ids[]=<feedId>` → `{ parsed: [{ price: { price, expo,
 * publish_time } }] }`, where the real value is `price * 10^expo`. The GBP/USD feed id is
 * configurable (`PYTH_GBPUSD_FEED_ID`) — verify it against pyth.network/price-feeds before using.
 *
 * Fails closed on a stale feed: if the published price is older than `FX_MAX_STALENESS_SEC`, we
 * throw rather than silently value holdings at a frozen rate. The caller surfaces the error; the
 * previous cached rate is not reused (it has its own TTL).
 */
async function fetchPyth(now: number): Promise<FxRate> {
  const url = `${config.pythHermesUrl}/v2/updates/price/latest?ids[]=${config.pythGbpUsdFeedId}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Pyth Hermes returned ${res.status}`);
  const json: any = await res.json();
  const p = json?.parsed?.[0]?.price;
  if (!p) throw new Error("Pyth Hermes: no price in response");
  const value = Number(p.price) * 10 ** Number(p.expo);
  if (!Number.isFinite(value) || value <= 0) throw new Error("Pyth Hermes: invalid price");
  const publishTime = Number(p.publish_time);
  if (!Number.isFinite(publishTime)) throw new Error("Pyth Hermes: missing publish_time");
  const ageSec = Math.floor(now / 1000) - publishTime;
  if (ageSec > config.fxMaxStalenessSec) {
    throw new Error(`Pyth GBP/USD is stale: ${ageSec}s old (max ${config.fxMaxStalenessSec}s)`);
  }
  return { pair: "GBP/USD", value: String(value), source: "pyth", asOf: publishTime };
}

/** Test/ops hook: drop the cached rate. */
export function clearFxCache() {
  cache = null;
}
