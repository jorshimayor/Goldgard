/**
 * High-throughput SBTS distribution for a sale/drop.
 *
 * Minting the same mint serializes on-chain (every `mintTo` write-locks the mint account), so
 * doing it per buyer is the slow path. Instead:
 *   1. `prefundPool` mints a supply ONCE into each fee-payer/source account (a one-time setup
 *      before the sale — these mints serialize, but there are only a handful of them).
 *   2. `distribute` then pays out via TRANSFERS. Transfers between distinct accounts parallelize,
 *      and rotating the source account + fee payer across the pool means no single account is the
 *      write-lock hotspot — so a burst actually runs in parallel through the engine.
 *
 * Requires `FEE_PAYER_SECRETS` (a real pool) for parallelism; with the default single key it
 * degrades to a serial source.
 */
import { PublicKey } from "@solana/web3.js";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createMintToInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { toBaseUnits } from "@stradebase/blockchain";

import { admin, connection, registry } from "../solana.js";
import { config } from "../config.js";
import { ApiError } from "../http.js";
import { submit } from "../tx/engine.js";

const SBTS = registry.SBTS;
const sourceAta = (owner: PublicKey) => getAssociatedTokenAddressSync(SBTS.mint, owner, false, SBTS.programId);

/**
 * One-time: mint `uiAmountEach` SBTS into every pool source account. Run before a sale so the
 * distribution phase is pure (parallelizable) transfers. Admin is the mint authority + fee payer.
 */
export async function prefundPool(uiAmountEach: string) {
  const base = toBaseUnits(uiAmountEach, SBTS.decimals);
  const pool = [];
  for (const kp of config.feePayers) {
    const ata = sourceAta(kp.publicKey);
    const signature = await submit(
      [
        createAssociatedTokenAccountIdempotentInstruction(admin.publicKey, ata, kp.publicKey, SBTS.mint, SBTS.programId),
        createMintToInstruction(SBTS.mint, ata, admin.publicKey, base, [], SBTS.programId),
      ],
      [admin],
      admin,
    );
    pool.push({ source: kp.publicKey.toBase58(), tokenAccount: ata.toBase58(), minted: uiAmountEach, signature });
  }
  return { sbtsMint: SBTS.mint.toBase58(), sources: pool.length, pool };
}

/**
 * Distribute SBTS to many recipients in parallel. Each transfer picks a pool source (round-robin),
 * so distinct source + destination + fee-payer accounts let the batch run concurrently. Returns a
 * per-recipient result; one failure never fails the whole batch.
 */
export async function distribute(recipients: Array<{ to: string; amount: string }>) {
  if (!Array.isArray(recipients) || recipients.length === 0) {
    throw new ApiError(400, "recipients must be a non-empty array of { to, amount }");
  }
  const pool = config.feePayers;
  const settled = await Promise.allSettled(
    recipients.map((r, i) => {
      const source = pool[i % pool.length];
      const to = new PublicKey(r.to);
      const dst = sourceAta(to);
      return submit(
        [
          createAssociatedTokenAccountIdempotentInstruction(source.publicKey, dst, to, SBTS.mint, SBTS.programId),
          createTransferCheckedInstruction(
            sourceAta(source.publicKey), SBTS.mint, dst, source.publicKey, toBaseUnits(r.amount, SBTS.decimals), SBTS.decimals, [], SBTS.programId,
          ),
        ],
        [],
        source,
      ).then((signature) => ({ to: r.to, amount: r.amount, source: source.publicKey.toBase58(), signature }));
    }),
  );

  const results = settled.map((s, i) =>
    s.status === "fulfilled"
      ? { ...s.value, ok: true }
      : { to: recipients[i].to, ok: false, error: String((s.reason as Error)?.message ?? s.reason) },
  );
  return { total: results.length, succeeded: results.filter((r) => r.ok).length, results };
}
