import { Connection } from "@solana/web3.js";
import { createTokenRegistry } from "@stradebase/blockchain";
import { config } from "./config.js";

/** Shared RPC connection. */
export const connection = new Connection(config.rpcUrl, "confirmed");

/**
 * The single source of truth for every supported mint (SBTS / USDC / USDT), including the
 * correct token program and decimals for each. Every service helper takes a `TokenConfig`
 * from here so we never guess a program id or decimals.
 */
export const registry = createTokenRegistry({
  cluster: config.cluster,
  sbtsMint: config.sbtsMint,
  sbtsDecimals: config.sbtsDecimals,
  usdcMint: config.usdcMint,
  usdtMint: config.usdtMint,
});

/** Custodial signer (mint + freeze authority, fee payer). */
export const admin = config.admin;
