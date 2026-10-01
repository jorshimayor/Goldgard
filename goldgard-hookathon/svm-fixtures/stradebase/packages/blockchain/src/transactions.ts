/**
 * Transaction parsing for SBTS / USDC / USDT activity.
 *
 * Parsing works from pre/post token balance metadata rather than instruction
 * decoding, which makes it robust across the classic Token program,
 * Token-2022, and CPI-wrapped transfers (e.g. future DEX swaps).
 */
import { Connection, PublicKey, ParsedTransactionWithMeta } from "@solana/web3.js";
import type { TokenConfig, TokenRegistry, TokenSymbol } from "./tokens.js";
import { tokenByMint } from "./tokens.js";
import { deriveAta } from "./ata.js";
import { fromBaseUnits } from "./amounts.js";

export interface TokenChange {
  signature: string;
  slot: number;
  /** Unix seconds; null when the node did not return a block time. */
  blockTime: number | null;
  symbol: TokenSymbol;
  mint: string;
  /** Owner wallet of the affected token account (base58), if known. */
  owner: string | null;
  /** The affected token account (base58). */
  tokenAccount: string;
  /** Signed change in base units (positive = received, negative = sent). */
  rawChange: bigint;
  /** Signed human-readable change, e.g. "-12.34". */
  uiChange: string;
  decimals: number;
  /** Whether the containing transaction failed. Failed txs move no tokens. */
  failed: boolean;
}

/**
 * Extract per-account balance changes for supported mints from one parsed
 * transaction. Pure function — safe to unit test without a network.
 */
export function extractTokenChanges(
  tx: ParsedTransactionWithMeta,
  registry: TokenRegistry
): TokenChange[] {
  const meta = tx.meta;
  if (!meta) return [];
  const signature = tx.transaction.signatures[0] ?? "";
  const failed = meta.err !== null;
  const accountKeys = tx.transaction.message.accountKeys;

  const pre = meta.preTokenBalances ?? [];
  const post = meta.postTokenBalances ?? [];

  // Merge pre/post by account index.
  const byIndex = new Map<
    number,
    { mint: string; owner?: string; decimals: number; pre: bigint; post: bigint }
  >();
  for (const b of pre) {
    byIndex.set(b.accountIndex, {
      mint: b.mint,
      decimals: b.uiTokenAmount.decimals,
      pre: BigInt(b.uiTokenAmount.amount),
      post: 0n,
      ...(b.owner !== undefined ? { owner: b.owner } : {}),
    });
  }
  for (const b of post) {
    const existing = byIndex.get(b.accountIndex);
    if (existing) {
      existing.post = BigInt(b.uiTokenAmount.amount);
      if (existing.owner === undefined && b.owner !== undefined) {
        existing.owner = b.owner;
      }
    } else {
      byIndex.set(b.accountIndex, {
        mint: b.mint,
        decimals: b.uiTokenAmount.decimals,
        pre: 0n,
        post: BigInt(b.uiTokenAmount.amount),
        ...(b.owner !== undefined ? { owner: b.owner } : {}),
      });
    }
  }

  const changes: TokenChange[] = [];
  for (const [accountIndex, entry] of byIndex) {
    const token = tokenByMint(registry, entry.mint);
    if (!token) continue; // unsupported mint — ignore
    const rawChange = entry.post - entry.pre;
    if (rawChange === 0n) continue;
    changes.push({
      signature,
      slot: tx.slot,
      blockTime: tx.blockTime ?? null,
      symbol: token.symbol,
      mint: entry.mint,
      owner: entry.owner ?? null,
      tokenAccount: accountKeys[accountIndex]?.pubkey.toBase58() ?? "",
      rawChange,
      uiChange: fromBaseUnits(rawChange, entry.decimals),
      decimals: entry.decimals,
      failed,
    });
  }
  return changes;
}

export interface HistoryOptions {
  /** Max signatures to fetch (default 20, max 1000). */
  limit?: number;
  /** Paginate: fetch entries strictly before this signature. */
  before?: string;
}

/**
 * Fetch transaction history of `owner` for one token: lists signatures that
 * touched the owner's ATA and returns the owner's balance changes, newest
 * first. Failed transactions are included (flagged `failed: true`, zero moves)
 * only when they produced no balance change entries at all — i.e. they are
 * simply absent, keeping the result clean for statement-style UIs.
 */
export async function getTokenHistory(
  connection: Connection,
  owner: PublicKey,
  token: TokenConfig,
  registry: TokenRegistry,
  opts: HistoryOptions = {}
): Promise<TokenChange[]> {
  const limit = Math.min(Math.max(opts.limit ?? 20, 1), 1000);
  const ata = deriveAta(owner, token);
  const signatures = await connection.getSignaturesForAddress(
    ata,
    { limit, ...(opts.before !== undefined ? { before: opts.before } : {}) },
    "confirmed"
  );
  if (signatures.length === 0) return [];

  const txs = await connection.getParsedTransactions(
    signatures.map((s) => s.signature),
    { maxSupportedTransactionVersion: 0, commitment: "confirmed" }
  );

  const ataB58 = ata.toBase58();
  const out: TokenChange[] = [];
  for (const tx of txs) {
    if (!tx) continue;
    for (const change of extractTokenChanges(tx, registry)) {
      if (change.tokenAccount === ataB58 && !change.failed) {
        out.push(change);
      }
    }
  }
  return out;
}
