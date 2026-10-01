/**
 * Decimal-safe amount conversion.
 *
 * All on-chain amounts are integers in base units (bigint). Floating point is
 * never used for money math — UI amounts are handled as strings.
 */

const UI_AMOUNT_RE = /^(\d+)(?:\.(\d+))?$/;

/**
 * Convert a UI amount string (e.g. "12.34") into base units.
 *
 * @throws if the string is not a plain non-negative decimal, or has more
 *         fractional digits than the token supports.
 */
export function toBaseUnits(uiAmount: string, decimals: number): bigint {
  assertDecimals(decimals);
  const trimmed = uiAmount.trim();
  const match = UI_AMOUNT_RE.exec(trimmed);
  if (!match) {
    throw new Error(
      `Invalid amount "${uiAmount}": expected a non-negative decimal like "12.34"`
    );
  }
  const whole = match[1]!;
  const frac = match[2] ?? "";
  if (frac.length > decimals) {
    throw new Error(
      `Amount "${uiAmount}" has ${frac.length} decimal places; token supports at most ${decimals}`
    );
  }
  return BigInt(whole) * 10n ** BigInt(decimals) + BigInt(frac.padEnd(decimals, "0") || "0");
}

/** Convert base units to a UI string, trimming trailing zeros ("12.34", "5"). */
export function fromBaseUnits(raw: bigint, decimals: number): string {
  assertDecimals(decimals);
  const negative = raw < 0n;
  const abs = negative ? -raw : raw;
  const divisor = 10n ** BigInt(decimals);
  const whole = abs / divisor;
  const frac = (abs % divisor).toString().padStart(decimals, "0").replace(/0+$/, "");
  const body = frac.length > 0 ? `${whole}.${frac}` : whole.toString();
  return negative ? `-${body}` : body;
}

function assertDecimals(decimals: number): void {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 12) {
    throw new Error(`Invalid decimals: ${decimals}`);
  }
}
