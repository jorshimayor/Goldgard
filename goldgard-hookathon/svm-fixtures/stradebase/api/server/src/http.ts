import type { NextFunction, Request, Response } from "express";
import { PublicKey } from "@solana/web3.js";

/** An error with an HTTP status code, thrown by handlers and rendered by the error middleware. */
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Wrap an async route so thrown errors reach the error middleware instead of hanging the request. */
export function asyncHandler(
  fn: (req: Request, res: Response) => Promise<unknown>,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res).catch(next);
  };
}

/**
 * Send JSON that may contain `bigint` (balances/amounts are bigints throughout the SDK).
 * `res.json` throws on bigint, so we serialize with a replacer that renders them as strings.
 */
export function sendJson(res: Response, data: unknown, status = 200): void {
  res.status(status).type("application/json").send(
    JSON.stringify(data, (_k, v) => (typeof v === "bigint" ? v.toString() : v)),
  );
}

/** Parse a base-58 pubkey or throw a 400. */
export function parsePubkey(value: unknown, label: string): PublicKey {
  try {
    return new PublicKey(String(value));
  } catch {
    throw new ApiError(400, `Invalid ${label}: ${String(value)}`);
  }
}

/** Require a non-empty string field or throw a 400. */
export function parseString(value: unknown, label: string): string {
  const s = typeof value === "string" ? value.trim() : "";
  if (!s) throw new ApiError(400, `Missing or empty field: ${label}`);
  return s;
}

/** Require a decimal UI amount string > 0 (kept as a string for bigint-safe conversion). */
export function parseUiAmount(value: unknown): string {
  const s = String(value ?? "").trim();
  if (!/^\d+(\.\d+)?$/.test(s) || Number(s) <= 0) {
    throw new ApiError(400, `Invalid amount: ${String(value)} (expected a positive decimal)`);
  }
  return s;
}
