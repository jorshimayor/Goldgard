/**
 * Associated Token Account (ATA) management, program-aware.
 *
 * SBTS lives under Token-2022 while USDC/USDT live under the classic Token
 * program — the ATA derivation includes the token program ID, so using the
 * wrong program yields a different (wrong) address. Every helper here takes a
 * TokenConfig so the correct program is always used.
 */
import {
  Connection,
  PublicKey,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountIdempotentInstruction,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import type { TokenConfig } from "./tokens.js";

/**
 * Derive the ATA for `owner` and the given token (program-aware).
 * `allowOwnerOffCurve` is enabled so PDA-owned wallets are supported.
 */
export function deriveAta(owner: PublicKey, token: TokenConfig): PublicKey {
  return getAssociatedTokenAddressSync(
    token.mint,
    owner,
    true, // allowOwnerOffCurve — supports PDA owners
    token.programId,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );
}

/**
 * Instruction that creates the ATA if (and only if) it doesn't exist.
 *
 * Uses the *idempotent* variant: safe to include in every transaction — it is
 * a no-op when the account already exists, which eliminates the classic
 * race-condition bug of "check then create".
 *
 * @param payer Account funding the rent (typically the fee payer).
 */
export function createAtaIdempotentInstruction(
  payer: PublicKey,
  owner: PublicKey,
  token: TokenConfig
): TransactionInstruction {
  const ata = deriveAta(owner, token);
  return createAssociatedTokenAccountIdempotentInstruction(
    payer,
    ata,
    owner,
    token.mint,
    token.programId,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );
}

/** True if the ATA for `owner`/`token` exists on chain. */
export async function ataExists(
  connection: Connection,
  owner: PublicKey,
  token: TokenConfig
): Promise<boolean> {
  const info = await connection.getAccountInfo(deriveAta(owner, token), "confirmed");
  return info !== null;
}
