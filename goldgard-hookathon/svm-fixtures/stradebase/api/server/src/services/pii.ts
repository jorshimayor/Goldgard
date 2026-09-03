/**
 * PII commitments — the only sanctioned way to produce the 32-byte hash that goes on-chain.
 *
 * Personal data never touches the blockchain. What lands there is
 * `sha256(salt || canonicalJson(pii))`, which lets us later *prove* what we had verified
 * for a wallet at a given slot without ever having published it.
 *
 * Three properties this module exists to guarantee — get any of them wrong and the
 * commitment is either unverifiable or useless:
 *
 * 1. **Canonical serialization.** `JSON.stringify` preserves insertion order, so two
 *    equal objects built by different code paths hash differently. `canonicalJson` sorts
 *    keys recursively and normalizes absent values, so the hash depends on the *data*.
 * 2. **A per-user salt.** `{name, dob, postcode}` carries roughly 30 bits of real entropy
 *    — an unsalted hash is a rainbow-table lookup, not a privacy measure. The salt is 32
 *    random bytes, stored encrypted in the database and never logged.
 * 3. **A recorded scheme id.** The on-chain `commitment_scheme` byte pins how a given
 *    record was produced, so rotating the algorithm later doesn't strand old records.
 *
 * Deleting a user's salt makes their commitment computationally unlinkable. That is the
 * right-to-erasure mechanism (see `docs/architecture.md`) and it only works if the
 * salt is genuinely gone, backups included.
 */

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/** Matches `COMMITMENT_SHA256_SALTED` in `programs/royalty-shares/src/constants.rs`. */
export const COMMITMENT_SHA256_SALTED = 1;

/** A JSON value that can be committed to. `undefined` is not permitted — see `canonicalJson`. */
export type PiiValue = string | number | boolean | null | PiiValue[] | { [k: string]: PiiValue };

/**
 * Deterministic JSON: object keys sorted lexicographically at every depth, no whitespace.
 *
 * Arrays keep their order (it is data, not layout). `undefined` is rejected rather than
 * silently dropped — `{a: 1, b: undefined}` and `{a: 1}` must not be able to produce
 * different commitments depending on which code path built the object.
 */
export function canonicalJson(value: PiiValue): string {
  if (value === undefined) {
    throw new TypeError("canonicalJson: undefined is ambiguous — use null for an absent field");
  }
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(",")}}`;
}

/** Fresh 32-byte salt. Store encrypted alongside the user row; never log it. */
export function newSalt(): Buffer {
  return randomBytes(32);
}

/**
 * `sha256(salt || canonicalJson(pii))` as a 32-byte buffer.
 *
 * @param pii   the exact record to commit to — persist this verbatim as `users.pii_canonical`,
 *              otherwise the commitment can never be re-derived and verification is impossible.
 * @param salt  32 bytes from `newSalt()`.
 */
export function commit(pii: PiiValue, salt: Buffer): Buffer {
  if (salt.length !== 32) throw new TypeError(`salt must be 32 bytes, got ${salt.length}`);
  return createHash("sha256").update(salt).update(canonicalJson(pii), "utf8").digest();
}

/**
 * Re-derive and compare in constant time.
 *
 * This is what the verification job runs: recompute from the stored record + salt and
 * check against what the chain says. A mismatch means the database row was edited after
 * the commitment was written.
 */
export function verify(pii: PiiValue, salt: Buffer, onChain: Buffer | number[]): boolean {
  const expected = Buffer.from(onChain as any);
  if (expected.length !== 32) return false;
  return timingSafeEqual(commit(pii, salt), expected);
}

/** Anchor wants `[u8; 32]` as a plain number array. */
export const toBytes32 = (b: Buffer): number[] => Array.from(b);

/**
 * Username rules, mirrored from `instructions/username.rs::validate`.
 *
 * Kept deliberately narrow (`[a-z0-9_]{3,32}`) so each displayed name has exactly one byte
 * representation: `Josh`, `josh`, and `jоsh` (Cyrillic о) cannot be confused for one
 * another, and the raw bytes stay usable as a PDA seed. Validating here too just turns a
 * simulation failure into a readable 400.
 */
export const USERNAME_RE = /^[a-z0-9_]{3,32}$/;

export function assertUsername(username: unknown): string {
  if (typeof username !== "string" || !USERNAME_RE.test(username)) {
    throw new Error("username must be 3-32 characters of a-z, 0-9 or _");
  }
  return username;
}
