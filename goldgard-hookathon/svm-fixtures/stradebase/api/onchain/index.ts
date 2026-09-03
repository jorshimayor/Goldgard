/**
 * @stradebase/onchain — typed backend client for the royalty_shares +
 * transfer_hook Solana programs. Consumes the generated IDL/types from
 * `target/` (re-run `scripts/sync-idl.sh` after `anchor build`).
 */
export * from "./ids";
export * from "./pdas";
export * from "./client";
export type { RoyaltyShares } from "./types/royalty_shares";
export type { TransferHook } from "./types/transfer_hook";
