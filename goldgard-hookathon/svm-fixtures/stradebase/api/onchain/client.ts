/**
 * Typed program clients + account-set builders for the backend.
 *
 * `createPrograms` returns Anchor `Program` instances backed by the generated IDLs; the
 * readers wrap `program.account.*.fetch`; and the `*Accounts` builders assemble the exact
 * account map an instruction expects (mirroring the on-chain `#[derive(Accounts)]`), so the
 * caller only supplies the handful of real inputs. All addresses come from `pdas.ts` — the
 * single source of truth for PDA/ATA derivation.
 */
import { AnchorProvider, Program } from "@anchor-lang/core";
import { PublicKey } from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { SystemProgram } from "@solana/web3.js";

import royaltySharesIdl from "./idl/royalty_shares.json";
import transferHookIdl from "./idl/transfer_hook.json";
import type { RoyaltyShares } from "./types/royalty_shares";
import type { TransferHook } from "./types/transfer_hook";
import * as pda from "./pdas";

export type RoyaltyProgram = Program<RoyaltyShares>;
export type HookProgram = Program<TransferHook>;

/** Build typed clients for both programs from an Anchor provider. */
export function createPrograms(provider: AnchorProvider): {
  royalty: RoyaltyProgram;
  hook: HookProgram;
} {
  const royalty = new Program<RoyaltyShares>(royaltySharesIdl as RoyaltyShares, provider);
  const hook = new Program<TransferHook>(transferHookIdl as TransferHook, provider);
  return { royalty, hook };
}

// ---------- readers ----------

export const getGlobalConfig = (p: RoyaltyProgram) =>
  p.account.globalConfig.fetch(pda.globalConfigPda());

export const getListing = (p: RoyaltyProgram, listing: PublicKey) =>
  p.account.songListing.fetch(listing);

export const getIdentity = (p: RoyaltyProgram, user: PublicKey) =>
  p.account.identityRegistry.fetch(pda.identityPda(user));

export const getPosition = (p: RoyaltyProgram, shareMint: PublicKey, owner: PublicKey) =>
  p.account.holderPosition.fetch(pda.positionPda(shareMint, owner));

// ---------- account-set builders (mirror the on-chain instructions) ----------

/**
 * Account set for `buy_shares`. `sbstMint` must equal `globalConfig.sbstMint`,
 * `artist`/`treasury` are the listing's artist and the platform treasury owner.
 */
export function buySharesAccounts(params: {
  buyer: PublicKey;
  artist: PublicKey;
  treasury: PublicKey;
  listing: PublicKey;
  shareMint: PublicKey;
  sbstMint: PublicKey;
  tradeIndex: bigint;
}) {
  const { buyer, artist, treasury, listing, shareMint, sbstMint, tradeIndex } = params;
  return {
    buyer,
    globalConfig: pda.globalConfigPda(),
    listing,
    buyerIdentity: pda.identityPda(buyer),
    complianceConfig: pda.compliancePda(shareMint),
    shareMint,
    buyerShareAta: pda.shareAta(shareMint, buyer),
    position: pda.positionPda(shareMint, buyer),
    tradeRecord: pda.tradeRecordPda(listing, tradeIndex),
    sbstMint,
    buyerSbstAta: pda.sbstAta(sbstMint, buyer),
    artist,
    artistSbstAta: pda.sbstAta(sbstMint, artist),
    treasury,
    treasurySbstAta: pda.sbstAta(sbstMint, treasury),
    token2022Program: TOKEN_2022_PROGRAM_ID,
    sbstTokenProgram: TOKEN_PROGRAM_ID,
    associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
    systemProgram: SystemProgram.programId,
  };
}
