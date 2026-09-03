import {
  ComputeBudgetProgram,
  type Keypair,
  Transaction,
  type TransactionInstruction,
} from "@solana/web3.js";
import { config } from "../config.js";
import { connection } from "../solana.js";
import { ApiError } from "../http.js";
import { type TxSigner, toSigner } from "../signing/signer.js";

// ---------------- fee-payer pool ----------------
// Solana write-locks accounts, and the fee payer's lamport debit is a write. Rotating the
// fee payer across a pool spreads that contention so a burst doesn't serialize on one account.
let rr = 0;
export function nextFeePayer(): Keypair {
  const pool = config.feePayers;
  return pool[rr++ % pool.length];
}

// ---------------- bounded concurrency (backpressure) ----------------
// Cap in-flight submissions so a spike queues instead of opening thousands of RPC sockets and
// collapsing. Past the queue bound we shed load with 429 rather than falling over.
let active = 0;
const waiters: Array<() => void> = [];
async function acquire(): Promise<void> {
  if (active >= config.maxConcurrency) {
    if (waiters.length >= config.maxQueue) {
      throw new ApiError(429, "Server is at capacity — retry shortly");
    }
    await new Promise<void>((resolve) => waiters.push(resolve));
  }
  active++;
}
function release(): void {
  active--;
  waiters.shift()?.();
}

export const engineStats = () => ({
  active,
  queued: waiters.length,
  feePayers: config.feePayers.length,
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
function isRetriable(e: unknown): boolean {
  const m = String((e as Error)?.message ?? e).toLowerCase();
  return (
    m.includes("blockhash") ||
    m.includes("block height exceeded") ||
    m.includes("timed out") ||
    m.includes("timeout") ||
    m.includes("node is behind") ||
    m.includes("429") ||
    m.includes("rate limit")
  );
}

/**
 * Submit a transaction resiliently: bounded concurrency, a priority fee to land under
 * congestion, a fresh blockhash per attempt, and retry-with-backoff on transient errors.
 * `feePayer` should be the same key used as the rent payer inside `instructions` (pick it with
 * `nextFeePayer()` before building them).
 *
 * Signing goes through the {@link TxSigner} seam, not `keypair.secretKey`: each signer signs the
 * serialized message and the signature is attached. Callers may pass raw `Keypair`s (coerced to a
 * local signer) or any `TxSigner` — e.g. a KMS/MPC signer in production (see `docs/backend-handover.md`).
 */
export async function submit(
  instructions: TransactionInstruction[],
  signers: Array<TxSigner | Keypair>,
  feePayer: TxSigner | Keypair,
  opts: { computeUnitLimit?: number; priorityFeeMicroLamports?: number } = {},
): Promise<string> {
  const cuLimit = opts.computeUnitLimit ?? config.computeUnitLimit;
  const priceMicroLamports = opts.priorityFeeMicroLamports ?? config.priorityFeeMicroLamports;
  const payer = toSigner(feePayer);
  await acquire();
  try {
    let lastErr: unknown;
    for (let attempt = 0; attempt <= config.sendMaxRetries; attempt++) {
      try {
        const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
        const tx = new Transaction();
        if (priceMicroLamports > 0) {
          tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: cuLimit }));
          tx.add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: priceMicroLamports }));
        }
        for (const ix of instructions) tx.add(ix);
        tx.feePayer = payer.publicKey;
        tx.recentBlockhash = blockhash;

        // Fee payer + any extra authorities, de-duplicated by pubkey.
        const seen = new Set<string>();
        const all = [payer, ...signers.map(toSigner)].filter((s) => {
          const k = s.publicKey.toBase58();
          if (seen.has(k)) return false;
          seen.add(k);
          return true;
        });
        // Message-based signing so remote (KMS/MPC) signers work identically to local keypairs.
        const message = tx.serializeMessage();
        for (const s of all) {
          tx.addSignature(s.publicKey, Buffer.from(await s.signMessage(message)));
        }

        const sig = await connection.sendRawTransaction(tx.serialize(), {
          skipPreflight: false,
          maxRetries: 3,
        });
        await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");
        return sig;
      } catch (e) {
        lastErr = e;
        if (!isRetriable(e) || attempt === config.sendMaxRetries) break;
        await sleep(200 * 2 ** attempt);
      }
    }
    throw lastErr;
  } finally {
    release();
  }
}
