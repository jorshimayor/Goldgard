import { PublicKey } from "@solana/web3.js";
import {
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
} from "@solana/spl-token";
import { ROYALTY_SHARES_PROGRAM_ID, TRANSFER_HOOK_PROGRAM_ID } from "./ids";

const enc = (s: string) => Buffer.from(s);

/** Singleton platform config: ["global_config"] */
export function globalConfigPda(): PublicKey {
  return PublicKey.findProgramAddressSync([enc("global_config")], ROYALTY_SHARES_PROGRAM_ID)[0];
}

/** Per-user KYC record: ["identity", user] */
export function identityPda(user: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [enc("identity"), user.toBuffer()],
    ROYALTY_SHARES_PROGRAM_ID
  )[0];
}

/** Per-user platform profile (role + counters): ["user_profile", user] */
export function userProfilePda(user: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [enc("user_profile"), user.toBuffer()],
    ROYALTY_SHARES_PROGRAM_ID
  )[0];
}

/**
 * Username claim: ["username", username]
 *
 * Seeded by the raw name, which is only safe because the on-chain charset is
 * `[a-z0-9_]{3,32}` — one name, one byte representation, and within the 32-byte seed cap.
 */
export function usernamePda(username: string): PublicKey {
  return PublicKey.findProgramAddressSync([enc("username"), enc(username)], ROYALTY_SHARES_PROGRAM_ID)[0];
}

/** Listing ("card"): ["listing", artist, songId(32)] */
export function listingPda(artist: PublicKey, songId: Uint8Array): PublicKey {
  return PublicKey.findProgramAddressSync(
    [enc("listing"), artist.toBuffer(), Buffer.from(songId)],
    ROYALTY_SHARES_PROGRAM_ID
  )[0];
}

/** Token-2022 share mint: ["share_mint", listing] */
export function shareMintPda(listing: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [enc("share_mint"), listing.toBuffer()],
    ROYALTY_SHARES_PROGRAM_ID
  )[0];
}

/** Per-listing compliance config: ["compliance", shareMint] */
export function compliancePda(shareMint: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [enc("compliance"), shareMint.toBuffer()],
    ROYALTY_SHARES_PROGRAM_ID
  )[0];
}

/** Per-holder position: ["position", shareMint, owner] */
export function positionPda(shareMint: PublicKey, owner: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [enc("position"), shareMint.toBuffer(), owner.toBuffer()],
    ROYALTY_SHARES_PROGRAM_ID
  )[0];
}

/** Audit record: ["trade", listing, tradeIndex(u64 LE)] */
export function tradeRecordPda(listing: PublicKey, tradeIndex: bigint): PublicKey {
  const idx = Buffer.alloc(8);
  idx.writeBigUInt64LE(tradeIndex);
  return PublicKey.findProgramAddressSync(
    [enc("trade"), listing.toBuffer(), idx],
    ROYALTY_SHARES_PROGRAM_ID
  )[0];
}

/** Royalty distribution record (payout happened off-chain): ["distribution", listing, index(u64 LE)] */
export function distributionPda(listing: PublicKey, index: bigint): PublicKey {
  const idx = Buffer.alloc(8);
  idx.writeBigUInt64LE(index);
  return PublicKey.findProgramAddressSync(
    [enc("distribution"), listing.toBuffer(), idx],
    ROYALTY_SHARES_PROGRAM_ID
  )[0];
}

/** Transfer-hook resolver metadata (under the hook program): ["extra-account-metas", mint] */
export function extraAccountMetaListPda(shareMint: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [enc("extra-account-metas"), shareMint.toBuffer()],
    TRANSFER_HOOK_PROGRAM_ID
  )[0];
}


/** A holder's Token-2022 share ATA. */
export function shareAta(shareMint: PublicKey, owner: PublicKey): PublicKey {
  return getAssociatedTokenAddressSync(shareMint, owner, false, TOKEN_2022_PROGRAM_ID);
}

/** A wallet's SBST ATA (classic SPL). */
export function sbstAta(sbstMint: PublicKey, owner: PublicKey, allowOwnerOffCurve = false): PublicKey {
  return getAssociatedTokenAddressSync(sbstMint, owner, allowOwnerOffCurve, TOKEN_PROGRAM_ID);
}
