/**
 * Multi-token transfer builders for SBTS (Token-2022), USDC, and USDT.
 *
 * Design decisions for correctness:
 *  - `transferChecked` is used everywhere (validates mint + decimals on chain,
 *    protecting against decimal-mismatch bugs). Required for Token-2022 mints.
 *  - The recipient's ATA is created idempotently in the same transaction, so
 *    first-time recipients never cause failures.
 *  - Amounts are bigint base units only; use `toBaseUnits` at the API boundary.
 */
import {
  Connection,
  PublicKey,
  Transaction,
  TransactionInstruction,
  Signer,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import { createTransferCheckedInstruction } from "@solana/spl-token";
import type { TokenConfig } from "./tokens.js";
import { deriveAta, createAtaIdempotentInstruction } from "./ata.js";
import { getTokenBalance } from "./balances.js";

export interface TransferParams {
  /** Wallet sending the tokens (owner of the source ATA). */
  from: PublicKey;
  /** Wallet receiving the tokens (owner of the destination ATA). */
  to: PublicKey;
  token: TokenConfig;
  /** Amount in base units (use `toBaseUnits` to convert UI amounts). */
  amount: bigint;
  /** Fee payer / rent payer for ATA creation. Defaults to `from`. */
  payer?: PublicKey;
}

function validate(params: TransferParams): void {
  if (params.amount <= 0n) {
    throw new Error(`Transfer amount must be positive, got ${params.amount}`);
  }
  if (params.from.equals(params.to)) {
    throw new Error("Sender and recipient are the same wallet");
  }
}

/**
 * Instructions for a token transfer:
 *  1. idempotent create of recipient ATA (no-op if it exists)
 *  2. transferChecked from sender ATA to recipient ATA
 */
export function buildTransferInstructions(
  params: TransferParams
): TransactionInstruction[] {
  validate(params);
  const { from, to, token, amount } = params;
  const payer = params.payer ?? from;
  const sourceAta = deriveAta(from, token);
  const destAta = deriveAta(to, token);
  return [
    createAtaIdempotentInstruction(payer, to, token),
    createTransferCheckedInstruction(
      sourceAta,
      token.mint,
      destAta,
      from, // owner authority
      amount,
      token.decimals,
      [], // multisig signers (none)
      token.programId
    ),
  ];
}

/**
 * Full unsigned transaction for a transfer, with fresh blockhash and fee payer
 * set. Caller signs with the sender's keypair (and payer's, if different).
 */
export async function buildTransferTransaction(
  connection: Connection,
  params: TransferParams
): Promise<Transaction> {
  const instructions = buildTransferInstructions(params);
  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash("confirmed");
  const tx = new Transaction({
    feePayer: params.payer ?? params.from,
    blockhash,
    lastValidBlockHeight,
  });
  tx.add(...instructions);
  return tx;
}

/**
 * Build, sign, send, and confirm a transfer. Verifies the sender has
 * sufficient balance before submitting (clearer error than an on-chain
 * failure and no wasted fee).
 *
 * @param signers Sender keypair, plus payer keypair if a separate payer is used.
 * @returns Transaction signature.
 */
export async function sendTransfer(
  connection: Connection,
  params: TransferParams,
  signers: Signer[]
): Promise<string> {
  validate(params);
  const balance = await getTokenBalance(connection, params.from, params.token);
  if (balance.raw < params.amount) {
    throw new Error(
      `Insufficient ${params.token.symbol} balance: have ${balance.ui}, ` +
        `need ${params.amount} base units`
    );
  }
  const tx = await buildTransferTransaction(connection, params);
  return sendAndConfirmTransaction(connection, tx, signers, {
    commitment: "confirmed",
  });
}
