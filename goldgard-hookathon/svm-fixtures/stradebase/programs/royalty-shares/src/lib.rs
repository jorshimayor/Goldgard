//! # royalty_shares — fractional music-royalty ownership (RWA core)
//!
//! Artists list a song as a fixed supply of fractional **royalty shares**; investors
//! acquire shares and receive a pro-rata cut of the streaming royalties. Shares are a
//! **Token-2022** mint so a companion [`transfer_hook`] program can enforce compliance on
//! every secondary move.
//!
//! ## This program is a ledger of record — it moves no money
//!
//! Payment for shares and royalty payouts are settled **off-chain by the API** (the user
//! initiates from the frontend; the backend signs with their custodial key). The program
//! issues and moves the *asset* (shares) and records every economic event — purchases
//! (`TradeRecord`) and royalty distributions (`DistributionRecord`) — with the settlement
//! amounts stored as data. No SBST/stablecoin is ever transferred on-chain and there is no
//! vault. See `docs/architecture.md`.
//!
//! ## Authority roles (set in [`GlobalConfig`](state::GlobalConfig))
//! - `authority` — platform ops (multisig): circuit breaker, listing status, recorded fee,
//!   and recording royalty distributions.
//! - `compliance_authority` — legal/risk: the KYC registry and per-listing blocklists/caps.
//! - `treasury` — recorded platform-fee recipient (fees are charged off-chain).
//!
//! ## Account model (all PDAs; see [`constants`] for the seeds)
//! ```text
//! GlobalConfig       ["global_config"]                     singleton
//! IdentityRegistry   ["identity", user]                    one per KYC'd wallet
//! SongListing        ["listing", artist, song_id]          one per song ("card")
//! share mint         ["share_mint", listing]               Token-2022, 0 decimals, program-owned authority
//! ComplianceConfig   ["compliance", share_mint]            per-listing cap + blocklist (seeded by MINT so the hook can find it)
//! HolderPosition     ["position", share_mint, owner]       lockup unlock time (read by the hook)
//! TradeRecord        ["trade", listing, trade_index]       immutable primary-sale audit row
//! DistributionRecord ["distribution", listing, index]      immutable royalty-payout audit row (off-chain payout)
//! ```
//!
//! ## Compliance is enforced in two places
//! 1. **Primary sale** — [`buy_shares`] checks KYC/sanctions/jurisdiction/accreditation/caps/pause inline.
//! 2. **Secondary transfer** — the Token-2022 [`transfer_hook`] re-checks them on every move.
//!
//! Security review and known limitations live in `docs/security.md`; design rationale in `docs/architecture.md`.
//!
//! [`transfer_hook`]: https://docs.rs/  (companion program `pk9f…UpEV`)

// Each instruction module exports a `handler`, and the admin handler fns share names with the
// generated `#[program]` entrypoints (e.g. `block_user`); both get glob-re-exported. Handlers are
// always called fully-qualified (`instructions::admin::block_user`), so the overlap is harmless —
// this silences the Anchor-idiomatic glob warning without restructuring the public exports.
#![allow(ambiguous_glob_reexports)]

pub mod constants;
pub mod error;
pub mod events;
pub mod instructions;
pub mod state;

use anchor_lang::prelude::*;

pub use constants::*;
pub use error::*;
pub use instructions::*;
pub use state::*;

// On-chain address of this program. Kept in sync with Anchor.toml + the deploy keypair
// via `anchor keys sync`. The companion transfer-hook program references it as a constant.
declare_id!("mWG6dhh3iZpTbdjxhc7k8PwqLKkKUFekcWqWRUNXruZ");

/// Instruction entrypoints. Each is a thin wrapper that delegates to its module's
/// `handler`; the real logic (and the account validation via `#[derive(Accounts)]`)
/// lives under [`instructions`].
#[program]
pub mod royalty_shares {
    use super::*;

    /// Deploy-once platform bootstrap. Gated to the program's **upgrade authority**
    /// (see `InitializeGlobal`) so the singleton can't be seized by a front-runner.
    /// The signer becomes the ops `authority`.
    pub fn initialize_global(
        ctx: Context<InitializeGlobal>,
        params: InitializeGlobalParams,
    ) -> Result<()> {
        instructions::initialize_global::handler(ctx, params)
    }

    /// User onboarding: create the platform profile that records a wallet's role
    /// (Artist / Investor / Both) and activity counters. Signed by the user (the custodial
    /// backend can sign on their behalf at signup); `payer` funds the rent.
    pub fn create_user_profile(ctx: Context<CreateUserProfile>, role: UserRole) -> Result<()> {
        instructions::user_profile::create(ctx, role)
    }

    /// Change your own role (e.g. Investor → Both). Only the profile owner may call this.
    pub fn update_user_role(ctx: Context<UpdateUserRole>, role: UserRole) -> Result<()> {
        instructions::user_profile::update_role(ctx, role)
    }

    /// Claim a public username (`[a-z0-9_]{3,32}`) for the signer's profile. Uniqueness is
    /// enforced by the runtime: the claim record is a PDA seeded by the name, so a second
    /// claim on a taken name fails at `init`. Signed by the user — publishing a handle
    /// against an address is a privacy decision, so it is never made on their behalf.
    pub fn claim_username(ctx: Context<ClaimUsername>, username: String) -> Result<()> {
        instructions::username::claim(ctx, username)
    }

    /// Give up a username, closing the claim record (rent refunded) and freeing the name.
    pub fn release_username(ctx: Context<ReleaseUsername>, username: String) -> Result<()> {
        instructions::username::release(ctx, username)
    }

    /// Create or update a user's KYC/AML record. Compliance-authority gated.
    ///
    /// Personal data never lands on-chain: `params.pii_commitment` is a salted hash of the
    /// off-chain record (see `docs/architecture.md`). Only the jurisdiction — which
    /// the transfer hook needs to enforce listing rules — is stored in the clear.
    pub fn register_identity(
        ctx: Context<RegisterIdentity>,
        params: RegisterIdentityParams,
    ) -> Result<()> {
        instructions::register_identity::handler(ctx, params)
    }

    /// Re-commit to a user's PII after a re-verification, without touching their
    /// compliance status. Bumps `pii_version` only if the commitment actually changed.
    pub fn set_pii_commitment(
        ctx: Context<SetPiiCommitment>,
        commitment: [u8; 32],
    ) -> Result<()> {
        instructions::register_identity::set_pii_commitment(ctx, commitment)
    }

    /// Artist creates a song card. Allocates the Token-2022 share mint with the
    /// **TransferHook** + **MetadataPointer** extensions (so every future transfer runs
    /// compliance and the mint points back at this listing), the SBST royalty vault, and
    /// the per-listing [`ComplianceConfig`](state::ComplianceConfig). The mint authority is
    /// the listing PDA, so only [`buy_shares`] can issue shares.
    pub fn create_listing(
        ctx: Context<CreateListing>,
        params: CreateListingParams,
    ) -> Result<()> {
        instructions::create_listing::handler(ctx, params)
    }

    /// Primary issuance. Runs the full compliance gate on the buyer, mints the shares to
    /// them (signed by the listing PDA), opens/extends their
    /// [`HolderPosition`](state::HolderPosition) (lockup), and writes an immutable
    /// [`TradeRecord`](state::TradeRecord).
    ///
    /// **Moves no money.** The API settles payment off-chain first; `settlement_amount` and
    /// `payment_tx_hash` are recorded here as the audit reference (`payment_tx_hash` is a
    /// caller-supplied off-ramp id, *not* an on-chain signature).
    pub fn buy_shares(
        ctx: Context<BuyShares>,
        shares_amount: u64,
        settlement_amount: u64,
        payment_tx_hash: [u8; 64],
    ) -> Result<()> {
        instructions::buy_shares::handler(ctx, shares_amount, settlement_amount, payment_tx_hash)
    }

    /// Record a royalty distribution the platform paid **off-chain** (pro-rata on live
    /// balances). Writes a [`DistributionRecord`](state::DistributionRecord); moves no funds.
    /// `merkle_root` may commit to the per-holder payout list (all-zero = none). Ops-gated.
    pub fn record_distribution(
        ctx: Context<RecordDistribution>,
        total_amount: u64,
        merkle_root: [u8; 32],
        reference: [u8; 64],
    ) -> Result<()> {
        instructions::record_distribution::handler(ctx, total_amount, merkle_root, reference)
    }

    /// Record a **secondary** (resale) trade on the ledger. Sent by the API in the same
    /// transaction as the Token-2022 transfer; the handler introspects the tx and requires a
    /// matching transfer (mint + amount + seller authority) to exist before writing the
    /// [`TradeRecord`](state::TradeRecord), so the on-chain history stays bound to real transfers.
    /// Uses the same `["trade", listing, index]` space as primary sales → one unified history.
    pub fn record_secondary_trade(
        ctx: Context<RecordSecondaryTrade>,
        shares_amount: u64,
        settlement_amount: u64,
        payment_tx_hash: [u8; 64],
    ) -> Result<()> {
        instructions::record_secondary_trade::handler(ctx, shares_amount, settlement_amount, payment_tx_hash)
    }

    /// Add a wallet to a listing's blocked list (sanctions / AML freeze).
    pub fn block_user(ctx: Context<UpdateComplianceCfg>, user: Pubkey) -> Result<()> {
        instructions::admin::block_user(ctx, user)
    }

    /// Remove a wallet from a listing's blocked list.
    pub fn unblock_user(ctx: Context<UpdateComplianceCfg>, user: Pubkey) -> Result<()> {
        instructions::admin::unblock_user(ctx, user)
    }

    /// Update a listing's per-wallet ownership cap.
    pub fn update_compliance(
        ctx: Context<UpdateComplianceCfg>,
        max_shares_per_wallet: u64,
    ) -> Result<()> {
        instructions::admin::update_compliance(ctx, max_shares_per_wallet)
    }

    /// Emergency: pause / resume / close a single listing. Authority gated.
    pub fn set_listing_status(ctx: Context<SetListingStatus>, status: ListingStatus) -> Result<()> {
        instructions::admin::set_listing_status(ctx, status)
    }

    /// Global circuit breaker. Authority gated.
    pub fn set_global_pause(ctx: Context<SetGlobalPause>, paused: bool) -> Result<()> {
        instructions::admin::set_global_pause(ctx, paused)
    }

    /// Adjust the platform fee (basis points) taken on sales. Authority gated.
    pub fn update_platform_fee(ctx: Context<SetGlobalPause>, platform_fee_bps: u16) -> Result<()> {
        instructions::admin::update_platform_fee(ctx, platform_fee_bps)
    }
}
