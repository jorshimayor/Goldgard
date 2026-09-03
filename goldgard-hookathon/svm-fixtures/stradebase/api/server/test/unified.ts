/**
 * Unit test for the unified-balance math (`computeUnified`) — pure, no validator/RPC.
 * Verifies FX conversion, decimal handling (SBTS=9, USDC/USDT=6), rounding, and formatting.
 */
import assert from "node:assert/strict";
import { computeUnified, type BalanceRow } from "../src/services/unified.js";
import type { FxRate } from "../src/services/fx.js";

const rate: FxRate = { pair: "GBP/USD", value: "1.27", source: "fixed", asOf: 1_721_900_000 };

// 1000 SBTS (9 dp) + 200 USDC (6 dp) + 100 USDT (6 dp).
const rows: BalanceRow[] = [
  { symbol: "SBTS", raw: 1_000_000_000_000n, ui: "1000", decimals: 9 },
  { symbol: "USDC", raw: 200_000_000n, ui: "200", decimals: 6 },
  { symbol: "USDT", raw: 100_000_000n, ui: "100", decimals: 6 },
];

const u = computeUnified(rows, rate);

// SBTS is GBP: 1000. USD → GBP: 200/1.27 = 157.48, 100/1.27 = 78.74. Total = 1236.22.
assert.equal(u.quote, "SBTS");
assert.equal(u.breakdown.find((b) => b.symbol === "SBTS")!.inSbts, "1000.00");
assert.equal(u.breakdown.find((b) => b.symbol === "USDC")!.inSbts, "157.48");
assert.equal(u.breakdown.find((b) => b.symbol === "USDT")!.inSbts, "78.74");
assert.equal(u.total, "1236.22");
assert.equal(u.rate.value, "1.27");

// Grouping for display.
const big = computeUnified([{ symbol: "SBTS", raw: 1_234_567_000_000_000n, ui: "1234567", decimals: 9 }], rate);
assert.equal(big.total, "1234567.00");
assert.equal(big.display, "1,234,567.00");

// Empty wallet → zero, no NaN.
const zero = computeUnified([], rate);
assert.equal(zero.total, "0.00");
assert.equal(zero.display, "0.00");

// Rounding to the nearest penny (0.005 GBP rounds up).
const round = computeUnified([{ symbol: "SBTS", raw: 5_000_000n, ui: "0.005", decimals: 9 }], rate);
assert.equal(round.total, "0.01");

// A 1:1 rate makes USD == GBP.
const parity = computeUnified(
  [{ symbol: "USDC", raw: 50_000_000n, ui: "50", decimals: 6 }],
  { ...rate, value: "1" },
);
assert.equal(parity.total, "50.00");

// Bad rate is rejected, not silently wrong.
assert.throws(() => computeUnified(rows, { ...rate, value: "0" }));

console.log("UNIFIED BALANCE (math) TESTS PASSED");
