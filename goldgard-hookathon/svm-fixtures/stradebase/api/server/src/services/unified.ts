/**
 * Unified balance math — convert a wallet's SBTS/USDC/USDT holdings into one SBTS (GBP) figure,
 * with all decimals and formatting resolved here so the frontend just renders strings.
 *
 * Pure and integer-based: works in "micro-GBP" (1e-6 GBP) via `bigint` so there is no float drift
 * across tokens, then formats to 2-decimal display at the very end. SBTS is treated as GBP; USD
 * stablecoins are divided by GBP/USD. See `fx.ts` for the rate and `docs/*` for the model.
 */
import type { FxRate } from "./fx.js";

/** Minimal balance shape (a subset of `@stradebase/blockchain`'s `TokenBalance`). */
export interface BalanceRow {
  symbol: string;
  raw: bigint;
  ui: string;
  decimals: number;
}

export interface UnifiedLine {
  symbol: string;
  /** Native amount, full precision (e.g. "200.5"). */
  amount: string;
  /** This holding's value in SBTS, 2dp (e.g. "157.48"). */
  inSbts: string;
  /** Same, grouped for display (e.g. "1,157.48"). */
  inSbtsDisplay: string;
}

export interface Unified {
  quote: "SBTS";
  /** Total value across all tokens, in SBTS, 2dp. */
  total: string;
  /** Same, grouped for display. */
  display: string;
  rate: FxRate;
  breakdown: UnifiedLine[];
}

const MICRO = 1_000_000n; // micro-GBP per GBP
const RATE_SCALE = 100_000_000n; // GBP/USD scaled to 1e8

/** Value of one holding in micro-GBP (integer). SBTS is GBP; USD tokens divide by GBP/USD. */
function toMicroGbp(row: BalanceRow, rateScaled: bigint): bigint {
  const pow = 10n ** BigInt(row.decimals);
  const isGbp = row.symbol.toUpperCase() === "SBTS";
  if (isGbp) return (row.raw * MICRO) / pow; // already GBP
  const microUsd = (row.raw * MICRO) / pow; // USD tokens (USDC/USDT)
  return (microUsd * RATE_SCALE) / rateScaled; // ÷ (GBP/USD)
}

/** Format micro-GBP to a 2dp string, rounding to the nearest penny. */
function fmt2(micro: bigint): string {
  const neg = micro < 0n;
  const m = neg ? -micro : micro;
  const pence = (m + 5_000n) / 10_000n; // 1 penny = 1e4 micro-GBP; +5000 rounds to nearest
  const whole = pence / 100n;
  const frac = pence % 100n;
  return `${neg ? "-" : ""}${whole}.${frac.toString().padStart(2, "0")}`;
}

/** Same as `fmt2` but with thousands separators on the whole part. */
function fmtGrouped(micro: bigint): string {
  const [w, f] = fmt2(micro).split(".");
  const neg = w.startsWith("-");
  const digits = neg ? w.slice(1) : w;
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${neg ? "-" : ""}${grouped}.${f}`;
}

/**
 * Convert balances to a unified SBTS view. `rate.value` is GBP/USD (1 GBP = value USD).
 * Everything returned is display-ready — no decimals or FX math left for the client.
 */
export function computeUnified(rows: BalanceRow[], rate: FxRate): Unified {
  const rateScaled = BigInt(Math.round(Number(rate.value) * Number(RATE_SCALE)));
  if (rateScaled <= 0n) throw new Error(`invalid FX rate: ${rate.value}`);

  let totalMicro = 0n;
  const breakdown = rows.map((row) => {
    const micro = toMicroGbp(row, rateScaled);
    totalMicro += micro;
    return { symbol: row.symbol, amount: row.ui, inSbts: fmt2(micro), inSbtsDisplay: fmtGrouped(micro) };
  });

  return { quote: "SBTS", total: fmt2(totalMicro), display: fmtGrouped(totalMicro), rate, breakdown };
}
