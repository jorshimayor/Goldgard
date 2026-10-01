//! Program-wide constants: PDA seed prefixes, account-size bounds, and math constants.
//!
//! The seeds here are the canonical namespaces for every PDA — keep them in lockstep with
//! the derivations in the instructions, the transfer-hook resolver, and the TS clients
//! (`api/onchain/pdas.ts`, `sbtBoard`). Changing a seed is a breaking on-chain migration.

use anchor_lang::prelude::*;

// ---------- PDA seeds ----------
#[constant]
pub const GLOBAL_CONFIG_SEED: &[u8] = b"global_config";
#[constant]
pub const IDENTITY_SEED: &[u8] = b"identity";
#[constant]
pub const LISTING_SEED: &[u8] = b"listing";
#[constant]
pub const SHARE_MINT_SEED: &[u8] = b"share_mint";
#[constant]
pub const COMPLIANCE_SEED: &[u8] = b"compliance";
#[constant]
pub const POSITION_SEED: &[u8] = b"position";
#[constant]
pub const TRADE_SEED: &[u8] = b"trade";
/// Royalty distribution event (recorded; the payout itself happens off-chain).
#[constant]
pub const DISTRIBUTION_SEED: &[u8] = b"distribution";
#[constant]
pub const USER_PROFILE_SEED: &[u8] = b"user_profile";
/// Username claim. Seeded by the **raw** username bytes — safe because the charset is
/// restricted to `[a-z0-9_]` (see `MAX_USERNAME_LEN`), so a name has exactly one byte
/// representation and cannot collide by case or homoglyph.
#[constant]
pub const USERNAME_SEED: &[u8] = b"username";
#[constant]
pub const RESALE_SEED: &[u8] = b"resale";
#[constant]
pub const DISTRIBUTOR_SEED: &[u8] = b"distributor";

// ---------- Bounds (drive InitSpace) ----------
pub const MAX_METADATA_URI_LEN: usize = 200;
pub const MAX_JURISDICTIONS: usize = 20;
pub const MAX_BLOCKED_USERS: usize = 50;
/// Display name of a royalty distributor (e.g. "DistroKid"), stored on `DistributorLink`.
pub const MAX_DISTRIBUTOR_NAME_LEN: usize = 64;
/// Usernames are `[a-z0-9_]{3,32}`. The 32-byte ceiling is a hard requirement, not a
/// preference: a Solana PDA seed is capped at 32 bytes, and keeping the raw name usable
/// as a seed is what lets the runtime enforce uniqueness for us (a duplicate `init`
/// simply fails) instead of us maintaining a reservation table.
pub const MAX_USERNAME_LEN: usize = 32;
/// Below this, the namespace is too scarce and squatting is trivial.
pub const MIN_USERNAME_LEN: usize = 3;

// ---------- PII commitments ----------
/// `commitment_scheme` value for `sha256(salt || canonical_json(pii))`.
/// Stored on-chain so a future migration to a different hash or a Merkle commitment can
/// be told apart from this one when verifying an old record.
pub const COMMITMENT_SHA256_SALTED: u8 = 1;

// ---------- Time ----------
/// A "month" for `lease_duration_months` accounting: a flat 30 days. Calendar months
/// vary, and an on-chain program has no calendar — a fixed stride keeps `lease_expiry`
/// deterministic and auditable. Front-ends must present the exact expiry timestamp
/// rather than re-deriving it from a calendar.
pub const SECONDS_PER_MONTH: i64 = 30 * 24 * 60 * 60;

// ---------- Math ----------
/// Basis-point denominator (100% = 10_000 bps).
#[constant]
pub const BPS_DENOMINATOR: u64 = 10_000;

/// Fractional royalty shares are indivisible -> the Token-2022 share mint uses 0 decimals.
#[constant]
pub const SHARE_DECIMALS: u8 = 0;

/// Program id of the companion `transfer_hook` compliance program.
/// Kept as a constant so `create_listing` can wire the mint's TransferHook
/// extension without a crate-level dependency cycle. Must match Anchor.toml.
pub const TRANSFER_HOOK_PROGRAM_ID: Pubkey =
    Pubkey::from_str_const("pk9fzHd77xiV5w5mqEsjfa8RKjdye9t9hY8W2VBUpEV");
