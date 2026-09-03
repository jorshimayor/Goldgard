import { describe, it, expect } from "vitest";
import { toBaseUnits, fromBaseUnits } from "../src/amounts.js";

describe("toBaseUnits", () => {
  it("converts whole numbers", () => {
    expect(toBaseUnits("5", 6)).toBe(5_000_000n);
    expect(toBaseUnits("0", 6)).toBe(0n);
  });

  it("converts decimals", () => {
    expect(toBaseUnits("12.34", 6)).toBe(12_340_000n);
    expect(toBaseUnits("0.000001", 6)).toBe(1n);
    expect(toBaseUnits("1.5", 9)).toBe(1_500_000_000n);
  });

  it("handles max precision exactly", () => {
    expect(toBaseUnits("0.123456", 6)).toBe(123_456n);
  });

  it("rejects too many decimal places", () => {
    expect(() => toBaseUnits("0.1234567", 6)).toThrow(/decimal places/);
  });

  it("rejects malformed input", () => {
    for (const bad of ["", "abc", "1.2.3", "-5", "+5", "1e6", ".5", "5.", "1,000", "NaN", "Infinity"]) {
      expect(() => toBaseUnits(bad, 6), bad).toThrow();
    }
  });

  it("avoids float precision bugs", () => {
    // 0.1 + 0.2 style issues can't occur — string math only
    expect(toBaseUnits("0.3", 9)).toBe(300_000_000n);
    expect(toBaseUnits("9007199254740993", 0)).toBe(9007199254740993n); // > MAX_SAFE_INTEGER
  });
});

describe("fromBaseUnits", () => {
  it("formats and trims trailing zeros", () => {
    expect(fromBaseUnits(12_340_000n, 6)).toBe("12.34");
    expect(fromBaseUnits(5_000_000n, 6)).toBe("5");
    expect(fromBaseUnits(1n, 6)).toBe("0.000001");
    expect(fromBaseUnits(0n, 6)).toBe("0");
  });

  it("handles negatives (used for sent amounts in history)", () => {
    expect(fromBaseUnits(-12_340_000n, 6)).toBe("-12.34");
  });

  it("round-trips", () => {
    for (const s of ["0.000001", "123456.789", "1", "0.5"]) {
      expect(fromBaseUnits(toBaseUnits(s, 6), 6)).toBe(s);
    }
  });
});
