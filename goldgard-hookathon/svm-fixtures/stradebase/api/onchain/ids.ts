import { PublicKey } from "@solana/web3.js";
import royaltySharesIdl from "./idl/royalty_shares.json";
import transferHookIdl from "./idl/transfer_hook.json";

/** On-chain program ids, read from the generated IDLs (single source of truth). */
export const ROYALTY_SHARES_PROGRAM_ID = new PublicKey(royaltySharesIdl.address);
export const TRANSFER_HOOK_PROGRAM_ID = new PublicKey(transferHookIdl.address);
