/**
 * Multi-token balance retrieval for SBTS, USDC, and USDT.
 */
import { Connection, PublicKey } from "@solana/web3.js";
import { getAccount, TokenAccountNotFoundError, TokenInvalidAccountOwnerError } from "@solana/spl-token";
import type { TokenConfig, TokenRegistry, TokenSymbol } from "./tokens.js";
import { allTokens } from "./tokens.js";
import { deriveAta } from "./ata.js";
import { fromBaseUnits } from "./amounts.js";

export interface TokenBalance {
  symbol: TokenSymbol;
  mint: string;
  /** The owner's ATA for this mint. */
  tokenAccount: string;
  /** Whether the ATA exists on chain. Missing ATA reads as zero balance. */
  exists: boolean;
  /** Balance in base units. */
  raw: bigint;
  /** Human-readable balance string, e.g. "12.34". */
  ui: string;
  decimals: number;
}

/**
 * Balance of one token for `owner`. A missing ATA is not an error — it is
 * reported as `exists: false` with a zero balance.
 */
export async function getTokenBalance(
  connection: Connection,
  owner: PublicKey,
  token: TokenConfig
): Promise<TokenBalance> {
  const ata = deriveAta(owner, token);
  const base = {
    symbol: token.symbol,
    mint: token.mint.toBase58(),
    tokenAccount: ata.toBase58(),
    decimals: token.decimals,
  };
  try {
    const account = await getAccount(connection, ata, "confirmed", token.programId);
    return {
      ...base,
      exists: true,
      raw: account.amount,
      ui: fromBaseUnits(account.amount, token.decimals),
    };
  } catch (err) {
    if (
      err instanceof TokenAccountNotFoundError ||
      err instanceof TokenInvalidAccountOwnerError
    ) {
      return { ...base, exists: false, raw: 0n, ui: "0" };
    }
    throw err;
  }
}

/**
 * Balances for all registry tokens (SBTS, USDC, USDT), fetched in parallel.
 * Result order matches registry order.
 */
export async function getAllBalances(
  connection: Connection,
  owner: PublicKey,
  registry: TokenRegistry
): Promise<TokenBalance[]> {
  return Promise.all(
    allTokens(registry).map((token) => getTokenBalance(connection, owner, token))
  );
}
