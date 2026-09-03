/**
 * Token registry for Stradebase.
 *
 * Central source of truth for every mint the app supports:
 *  - SBTS  — native Stradebase stablecoin (GBP-pegged), minted under Token-2022
 *  - USDC  — Circle USD stablecoin, classic SPL Token program
 *  - USDT  — Tether USD stablecoin, classic SPL Token program
 *
 * All other modules (ATA, balances, transfers, parsing) consume TokenConfig
 * objects from this registry so program IDs and decimals are never guessed.
 */
import { PublicKey } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";

export type TokenSymbol = "SBTS" | "USDC" | "USDT";
export type Cluster = "mainnet-beta" | "devnet";

export interface TokenConfig {
  readonly symbol: TokenSymbol;
  readonly name: string;
  /** Mint address of the token. */
  readonly mint: PublicKey;
  /** Owning token program: classic SPL Token or Token-2022. */
  readonly programId: PublicKey;
  /** Number of base-unit decimals (verify against chain with `verifyRegistry`). */
  readonly decimals: number;
  /** ISO-4217 currency the token is pegged to. */
  readonly pegCurrency: "USD" | "GBP";
}

export type TokenRegistry = Readonly<Record<TokenSymbol, TokenConfig>>;

/** Canonical mainnet mints (verified constants — do not edit). */
export const MAINNET_USDC_MINT = new PublicKey(
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
);
export const MAINNET_USDT_MINT = new PublicKey(
  "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB"
);
/** Circle's official devnet USDC mint (faucet.circle.com). */
export const DEVNET_USDC_MINT = new PublicKey(
  "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"
);

export interface RegistryOptions {
  cluster: Cluster;
  /** SBTS mint address (Token-2022). Required — this is Stradebase's own mint. */
  sbtsMint: PublicKey | string;
  /** SBTS decimals. Defaults to 9. */
  sbtsDecimals?: number;
  /** Override USDC mint (required on devnet only if not using Circle's faucet mint). */
  usdcMint?: PublicKey | string;
  /** Override USDT mint (required on devnet — Tether has no canonical devnet mint). */
  usdtMint?: PublicKey | string;
}

function toPk(v: PublicKey | string, label: string): PublicKey {
  try {
    return typeof v === "string" ? new PublicKey(v) : v;
  } catch {
    throw new Error(`Invalid public key for ${label}: ${String(v)}`);
  }
}

/**
 * Build the token registry for a given cluster.
 *
 * @throws if a required mint is missing or malformed.
 */
export function createTokenRegistry(opts: RegistryOptions): TokenRegistry {
  const { cluster } = opts;

  const sbtsDecimals = opts.sbtsDecimals ?? 9;
  if (!Number.isInteger(sbtsDecimals) || sbtsDecimals < 0 || sbtsDecimals > 12) {
    throw new Error(`Invalid SBTS decimals: ${sbtsDecimals}`);
  }

  let usdcMint: PublicKey;
  if (opts.usdcMint) {
    usdcMint = toPk(opts.usdcMint, "USDC mint");
  } else {
    usdcMint = cluster === "mainnet-beta" ? MAINNET_USDC_MINT : DEVNET_USDC_MINT;
  }

  let usdtMint: PublicKey;
  if (opts.usdtMint) {
    usdtMint = toPk(opts.usdtMint, "USDT mint");
  } else if (cluster === "mainnet-beta") {
    usdtMint = MAINNET_USDT_MINT;
  } else {
    throw new Error(
      "USDT has no canonical devnet mint. Pass `usdtMint` explicitly (e.g. a test mint you created)."
    );
  }

  return Object.freeze({
    SBTS: Object.freeze({
      symbol: "SBTS" as const,
      name: "Stradebase GBP Stablecoin",
      mint: toPk(opts.sbtsMint, "SBTS mint"),
      programId: TOKEN_2022_PROGRAM_ID,
      decimals: sbtsDecimals,
      pegCurrency: "GBP" as const,
    }),
    USDC: Object.freeze({
      symbol: "USDC" as const,
      name: "USD Coin",
      mint: usdcMint,
      programId: TOKEN_PROGRAM_ID,
      decimals: 6,
      pegCurrency: "USD" as const,
    }),
    USDT: Object.freeze({
      symbol: "USDT" as const,
      name: "Tether USD",
      mint: usdtMint,
      programId: TOKEN_PROGRAM_ID,
      decimals: 6,
      pegCurrency: "USD" as const,
    }),
  });
}

/** Look up a token config by its mint address; undefined if not a supported mint. */
export function tokenByMint(
  registry: TokenRegistry,
  mint: PublicKey | string
): TokenConfig | undefined {
  const m = typeof mint === "string" ? mint : mint.toBase58();
  return Object.values(registry).find((t) => t.mint.toBase58() === m);
}

/** All supported tokens as an array. */
export function allTokens(registry: TokenRegistry): TokenConfig[] {
  return Object.values(registry);
}
