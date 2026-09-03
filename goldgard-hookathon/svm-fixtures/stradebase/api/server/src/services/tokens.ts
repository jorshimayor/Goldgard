import { Keypair, PublicKey, type TransactionInstruction } from "@solana/web3.js";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createFreezeAccountInstruction,
  createMintToInstruction,
  createThawAccountInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import {
  getAllBalances,
  getTokenBalance,
  getTokenHistory,
  toBaseUnits,
  type TokenConfig,
  type TokenSymbol,
} from "@stradebase/blockchain";

import { admin, connection, registry } from "../solana.js";
import { config } from "../config.js";
import { ApiError } from "../http.js";
import { cached, invalidate } from "../cache.js";
import { nextFeePayer, submit } from "../tx/engine.js";
import { gbpUsd } from "./fx.js";
import { computeUnified } from "./unified.js";

const SYMBOLS = ["SBTS", "USDC", "USDT"] as const;

function tokenOf(symbol: string): TokenConfig {
  const s = symbol?.toUpperCase() as TokenSymbol;
  if (!SYMBOLS.includes(s as (typeof SYMBOLS)[number])) {
    throw new ApiError(400, `Unsupported token '${symbol}'. Supported: ${SYMBOLS.join(", ")}`);
  }
  return registry[s];
}

const ataOf = (token: TokenConfig, owner: PublicKey, offCurve = false) =>
  getAssociatedTokenAddressSync(token.mint, owner, offCurve, token.programId);

// ---------------- reads (short-TTL cached to shed RPC load) ----------------
export const balances = (owner: string) =>
  cached(`bal:${owner}`, config.readCacheTtlMs, () =>
    getAllBalances(connection, new PublicKey(owner), registry),
  );

/**
 * One SBTS (GBP) figure across a wallet's SBTS/USDC/USDT holdings. USD stablecoins are converted
 * at GBP/USD (see `fx.ts`); all decimals + formatting are resolved here so the frontend just
 * renders `total`/`display` (and the per-token `breakdown`). Indicative — values holdings, not a
 * guaranteed swap rate.
 */
export const unifiedBalance = (owner: string) =>
  cached(`unified:${owner}`, config.readCacheTtlMs, async () => {
    const [rows, rate] = await Promise.all([
      getAllBalances(connection, new PublicKey(owner), registry),
      gbpUsd(),
    ]);
    return { owner, ...computeUnified(rows, rate) };
  });

export const balance = (owner: string, symbol: string) =>
  cached(`bal:${owner}:${symbol.toUpperCase()}`, config.readCacheTtlMs, () =>
    getTokenBalance(connection, new PublicKey(owner), tokenOf(symbol)),
  );

export const history = (owner: string, symbol: string, limit?: number, before?: string) =>
  cached(`hist:${owner}:${symbol.toUpperCase()}:${limit ?? ""}:${before ?? ""}`, config.readCacheTtlMs, () =>
    getTokenHistory(connection, new PublicKey(owner), tokenOf(symbol), registry, { limit, before }),
  );

export async function historyAll(owner: string, limit = 20) {
  return cached(`histAll:${owner}:${limit}`, config.readCacheTtlMs, async () => {
    const ownerPk = new PublicKey(owner);
    const perToken = await Promise.all(
      SYMBOLS.map((s) => getTokenHistory(connection, ownerPk, registry[s], registry, { limit })),
    );
    return perToken
      .flat()
      .sort((a, b) => (b.blockTime ?? 0) - (a.blockTime ?? 0))
      .slice(0, limit);
  });
}

// ---------------- writes (through the resilient engine) ----------------

/** Mint SBTS to a wallet. NOTE: `mintTo` write-locks the SBTS mint account, so concurrent mints
 *  of the same mint serialize on-chain — for a high-volume sale, pre-mint a supply and TRANSFER
 *  (see docs/architecture.md). USDC/USDT are external and cannot be minted here. */
export async function mintSbts(to: string, uiAmount: string) {
  const token = registry.SBTS;
  const owner = new PublicKey(to);
  const ata = ataOf(token, owner);
  const payer = nextFeePayer();
  const ixs: TransactionInstruction[] = [
    createAssociatedTokenAccountIdempotentInstruction(payer.publicKey, ata, owner, token.mint, token.programId),
    createMintToInstruction(token.mint, ata, admin.publicKey, toBaseUnits(uiAmount, token.decimals), [], token.programId),
  ];
  const signature = await submit(ixs, [admin], payer);
  invalidate(`bal:${to}`);
  return { signature, symbol: "SBTS", to, amount: uiAmount, tokenAccount: ata.toBase58() };
}

/** Transfer any supported token. Distinct source/destination accounts parallelize on-chain; the
 *  fee payer rotates across the pool so a burst doesn't serialize on one payer account. */
export async function transfer(params: { to: string; symbol: string; uiAmount: string; fromSecret?: number[] }) {
  const token = tokenOf(params.symbol);
  const sender = params.fromSecret ? Keypair.fromSecretKey(Uint8Array.from(params.fromSecret)) : admin;
  const to = new PublicKey(params.to);
  const payer = nextFeePayer();
  const src = ataOf(token, sender.publicKey);
  const dst = ataOf(token, to);
  const ixs: TransactionInstruction[] = [
    createAssociatedTokenAccountIdempotentInstruction(payer.publicKey, dst, to, token.mint, token.programId),
    createTransferCheckedInstruction(
      src, token.mint, dst, sender.publicKey, toBaseUnits(params.uiAmount, token.decimals), token.decimals, [], token.programId,
    ),
  ];
  const signature = await submit(ixs, [sender], payer);
  invalidate(`bal:${sender.publicKey.toBase58()}`);
  invalidate(`bal:${params.to}`);
  return { signature, symbol: token.symbol, from: sender.publicKey.toBase58(), to: params.to, amount: params.uiAmount };
}

async function setFrozen(owner: string, symbol: string, freeze: boolean) {
  const token = tokenOf(symbol);
  if (token.symbol !== "SBTS") {
    throw new ApiError(
      400,
      `Cannot ${freeze ? "freeze" : "thaw"} ${token.symbol}: the platform is not its freeze authority. Only SBTS (and platform NFTs) can be frozen.`,
    );
  }
  const ata = ataOf(token, new PublicKey(owner));
  const payer = nextFeePayer();
  const ix = freeze
    ? createFreezeAccountInstruction(ata, token.mint, admin.publicKey, [], token.programId)
    : createThawAccountInstruction(ata, token.mint, admin.publicKey, [], token.programId);
  const signature = await submit([ix], [admin], payer);
  invalidate(`bal:${owner}`);
  return { signature, symbol: token.symbol, owner, tokenAccount: ata.toBase58(), frozen: freeze };
}
export const freeze = (owner: string, symbol: string) => setFrozen(owner, symbol, true);
export const thaw = (owner: string, symbol: string) => setFrozen(owner, symbol, false);

export function catalogue() {
  return SYMBOLS.map((s) => {
    const t = registry[s];
    return {
      symbol: t.symbol,
      name: t.name,
      mint: t.mint.toBase58(),
      decimals: t.decimals,
      pegCurrency: t.pegCurrency,
      program: t.programId.toBase58(),
      mintable: t.symbol === "SBTS",
      freezable: t.symbol === "SBTS",
    };
  });
}
