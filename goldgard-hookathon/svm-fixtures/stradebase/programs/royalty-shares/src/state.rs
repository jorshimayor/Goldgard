//! On-chain account layouts.
//!
//! Every struct here is a program-owned PDA (see [`crate::constants`] for the seeds).
//! `#[derive(InitSpace)]` computes the byte size used at `init` time — when you add a
//! field, the space updates automatically, but a `Vec`/`String` field also needs a
//! `#[max_len(..)]` so the size stays bounded and deterministic.
//!
//! Anchor prefixes each account with an 8-byte discriminator, which is why every
//! `space` in the instructions is `8 + Struct::INIT_SPACE`.

use anchor_lang::prelude::*;

use crate::constants::{
    MAX_BLOCKED_USERS, MAX_JURISDICTIONS, MAX_METADATA_URI_LEN, MAX_USERNAME_LEN,
};

/// Singleton platform configuration. **PDA:** `["global_config"]`.
///
/// The single source of truth for platform-wide policy. Written once by
/// `initialize_global` (upgrade-authority gated); only the two authority fields can
/// mutate it thereafter.
#[account]
#[derive(InitSpace)]
pub struct GlobalConfig {
    /// Platform ops authority (multisig recommended). Controls the circuit breaker
    /// (`set_global_pause`) and listing status (`set_listing_status`).
    pub authority: Pubkey,
    /// Compliance/risk authority. Sole writer of the KYC registry and per-listing
    /// blocklists/caps. Separated from `authority` so ops and legal are distinct keys.
    pub compliance_authority: Pubkey,
    /// Platform fee recipient. **Recorded policy only** — this program moves no money, so
    /// the fee is charged and settled off-chain by the API. Kept on-chain for transparency.
    pub treasury: Pubkey,
    /// The settlement currency (SBST) all listing prices are quoted in. **Reference only**:
    /// no SBST is ever moved on-chain — payment happens off-chain and is recorded as data
    /// on each [`TradeRecord`]. See `docs/architecture.md`.
    pub sbst_mint: Pubkey,
    /// Platform fee on primary sales, in basis points (e.g. `200` = 2%). Recorded policy;
    /// enforced by the API when it settles payment, not by this program.
    pub platform_fee_bps: u16,
    /// Max fraction of a listing's supply one wallet may hold, in basis points
    /// (e.g. `499` = 4.99%). Enforced on both primary buys and secondary transfers.
    /// NOTE: per-wallet, not per-investor — see docs/security.md (per-wallet caps).
    pub max_global_ownership_bps: u16,
    /// Global emergency pause. When true, `buy_shares` and all secondary transfers (via the
    /// hook) are halted.
    pub is_paused: bool,
    /// Canonical PDA bump, stored so later instructions validate without re-deriving.
    pub bump: u8,
}

/// Transactional standing of a wallet. Deliberately **reason-free**.
///
/// This replaced an earlier `is_sanctioned: bool`. Publishing "this named person is
/// sanctioned" to an immutable public ledger is a defamation and GDPR exposure that
/// outlives the designation itself — including when the designation was an error. The
/// enforcement is identical; the *reason* now lives in the case file off-chain.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum ComplianceStatus {
    /// Full access: may buy, hold, send and receive.
    Ok,
    /// Soft freeze (review in progress): may hold and *receive*, but may not buy or send.
    /// Holding outflow without blocking inbound settlement means an open review doesn't
    /// strand a counterparty mid-trade.
    Restricted,
    /// Hard block: no transfers in any direction, no purchases.
    Frozen,
}

impl ComplianceStatus {
    /// May originate a primary purchase.
    pub fn can_buy(&self) -> bool {
        matches!(self, ComplianceStatus::Ok)
    }
    /// May send shares in a secondary transfer.
    pub fn can_send(&self) -> bool {
        matches!(self, ComplianceStatus::Ok)
    }
    /// May receive shares. `Restricted` still can — see the enum docs.
    pub fn can_receive(&self) -> bool {
        !matches!(self, ComplianceStatus::Frozen)
    }
}

/// Per-user KYC / AML record. **PDA:** `["identity", user]`.
///
/// Written only by the compliance authority (`register_identity` / `set_pii_commitment`).
/// The transfer hook reads this for both the sender and recipient on every secondary
/// transfer, and `buy_shares` reads the buyer's.
///
/// **Privacy:** everything here is world-readable forever. The only personal data present
/// is the 2-byte jurisdiction (which the transfer hook genuinely needs) and a salted hash
/// of the rest. See `docs/architecture.md`.
#[account]
#[derive(InitSpace)]
pub struct IdentityRegistry {
    /// The wallet this record describes. Pinned on first init; also the PDA seed.
    pub user: Pubkey,
    /// 0 = None, 1 = Basic, 2 = Accredited, 3 = Institutional. A holder needs ≥ 1.
    pub kyc_level: u8,
    /// ISO 3166-1 alpha-2 country code as raw bytes (e.g. `[b'G', b'B']`).
    pub jurisdiction: [u8; 2],
    /// Transactional standing. Gates buys and both sides of every transfer.
    pub status: ComplianceStatus,
    /// Accredited-investor status; required by listings with `requires_accredited`.
    pub accredited: bool,
    /// Commitment to the user's off-chain PII: `sha256(salt || canonical_json(pii))`.
    ///
    /// The salt is 32 random bytes held (encrypted) in the backend database — **without it
    /// this hash is brute-forceable**, since a name/DOB/postcode tuple carries only ~30
    /// bits of real entropy. Zeroed until the first KYC submission.
    ///
    /// Deleting the salt renders this unlinkable, which is our right-to-erasure mechanism.
    pub pii_commitment: [u8; 32],
    /// Bumped on every change to `pii_commitment`, giving a countable re-verification
    /// history. Must be mirrored in the database so drift is detectable.
    pub pii_version: u16,
    /// Which scheme produced `pii_commitment` (see `COMMITMENT_SHA256_SALTED`). Recorded so
    /// that old records stay verifiable after the scheme is rotated.
    pub commitment_scheme: u8,
    /// Unix time of the last compliance refresh (informational / for off-chain expiry).
    pub last_verified: i64,
    pub bump: u8,
}

/// What a wallet is allowed to do on the platform. Checked when creating listings.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum UserRole {
    /// Can buy shares only.
    Investor,
    /// Can create listings only.
    Artist,
    /// Both of the above.
    Both,
}

impl UserRole {
    /// Artists (and dual-role users) may create song listings.
    pub fn can_create_listing(&self) -> bool {
        matches!(self, UserRole::Artist | UserRole::Both)
    }
}

/// A claimed username. **PDA:** `["username", username_bytes]`.
///
/// This account exists purely so the **runtime** enforces uniqueness: `init` on an address
/// that already holds an account fails atomically, so two concurrent claims for the same
/// name cannot both succeed. That removes the need for a reservation table and the
/// check-then-write race that comes with one.
///
/// Seeding on the raw name rather than a hash is safe only because the charset is
/// restricted to `[a-z0-9_]` — one name has exactly one byte representation, so
/// `Josh` / `josh` / `jоsh` (Cyrillic `о`) cannot resolve to different accounts that look
/// identical to a human. See `claim_username` for the validation.
#[account]
#[derive(InitSpace)]
pub struct UsernameRecord {
    /// The wallet that owns this name. Only this wallet may release it.
    pub owner: Pubkey,
    /// Unix time of the claim, so disputes over who had a name first are resolvable.
    pub claimed_at: i64,
    pub bump: u8,
}

/// Per-user platform profile. **PDA:** `["user_profile", user]`.
///
/// Created at signup (the custodial backend can do this on the user's behalf) and separate from
/// [`IdentityRegistry`], which is the compliance-authority-owned KYC record.
///
/// **Privacy:** on-chain data is world-readable — this holds role, a public handle and
/// counters only. Never put PII here; personal data lives in the backend and is committed
/// to on-chain as a salted hash on [`IdentityRegistry`].
#[account]
#[derive(InitSpace)]
pub struct UserProfile {
    /// The wallet this profile belongs to; also the PDA seed.
    pub user: Pubkey,
    /// Public handle, or empty if none claimed. **Public by design**, and therefore a
    /// deliberate re-identification vector: a username tied to an address exposes that
    /// user's entire trading history to anyone. Claiming one must be opt-in, and trading
    /// with no username claimed must stay possible.
    ///
    /// The authoritative uniqueness record is the [`UsernameRecord`] PDA; this is the
    /// convenience copy so a profile read doesn't need a second lookup.
    #[max_len(MAX_USERNAME_LEN)]
    pub username: String,
    /// Artist / Investor / Both — gates listing creation.
    pub role: UserRole,
    /// Unix time the profile was created.
    pub created_at: i64,
    /// Listings this user has created (as an artist).
    pub listings_created: u64,
    /// Primary purchases this user has made. Full history comes from indexing `TradeRecord`
    /// by `from`/`to` — an on-chain list would grow unbounded.
    pub trades_count: u64,
    pub bump: u8,
}

/// Lifecycle state of a listing. `buy_shares` only proceeds while `Active`.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum ListingStatus {
    /// Created but not yet open (reserved; `create_listing` currently opens as `Active`).
    Pending,
    /// Open for primary purchase.
    Active,
    /// Every share has been minted (`shares_minted == total_shares`). Set automatically.
    SoldOut,
    /// Temporarily halted by ops.
    Paused,
    /// Permanently closed by ops.
    Closed,
}

/// A song "card": a fixed supply of fractional royalty shares.
/// **PDA:** `["listing", artist, song_id]`.
///
/// Immutable-after-init fields (`artist`, `song_id`, `share_mint`, `total_shares`) are
/// what make the self-referential PDA seeds safe to trust elsewhere.
#[account]
#[derive(InitSpace)]
pub struct SongListing {
    /// Creator of the listing; also the recipient of primary-sale proceeds and a PDA seed.
    pub artist: Pubkey,
    /// Stable unique id for the song (e.g. an ISRC or content hash). PDA seed.
    pub song_id: [u8; 32],
    /// Off-chain JSON (song details, perks, legal). The mint's MetadataPointer points at
    /// this listing account, which anchors this URI on-chain.
    #[max_len(MAX_METADATA_URI_LEN)]
    pub metadata_uri: String,
    /// Fixed total supply of shares. `shares_minted` can never exceed this.
    pub total_shares: u64,
    /// Shares issued so far via primary sales. Monotonic up to `total_shares`.
    pub shares_minted: u64,
    /// Primary price per share, in SBST base units.
    pub price_per_share: u64,
    /// Share of streaming royalties being sold, in basis points (informational on-chain).
    pub royalty_percent_sold: u16,
    /// Share the artist keeps, in basis points. `royalty_percent_sold + this ≤ 10_000`.
    pub artist_retained_percent: u16,
    /// Primary sale opens at this Unix time.
    pub start_time: i64,
    /// Optional primary sale close time (`None` = no end).
    pub end_time: Option<i64>,
    pub status: ListingStatus,
    /// The Token-2022 share mint (a PDA of this program; mint authority = this listing).
    pub share_mint: Pubkey,
    /// Mandatory hold after purchase; sets `HolderPosition.unlock_time = now + this`.
    pub lockup_seconds: u64,
    /// If true, holders must be `accredited` (checked on buy and on secondary receipt).
    pub requires_accredited: bool,
    /// Whitelist of allowed holder jurisdictions. **Empty = all allowed.**
    #[max_len(MAX_JURISDICTIONS)]
    pub allowed_jurisdictions: Vec<[u8; 2]>,
    /// Total royalties **recorded as distributed** off-chain, in settlement-currency minor
    /// units. Sum of every [`DistributionRecord.total_amount`]; monotonic. Audit figure —
    /// no funds back it on-chain.
    pub cumulative_royalties: u64,
    /// Distribution events recorded. Monotonic; doubles as the index seeding each
    /// [`DistributionRecord`] PDA.
    pub total_distributions: u64,
    /// Total trades recorded for this listing. Monotonic, and doubles as the index that seeds
    /// each `TradeRecord` PDA (guaranteeing uniqueness).
    pub total_trades: u64,
    pub bump: u8,
}

/// Whether a trade was a primary issuance or a secondary market move.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum TradeType {
    Primary,
    Secondary,
}

/// Immutable audit record, one per primary purchase.
/// **PDA:** `["trade", listing, trade_index]` where `trade_index` is the listing's
/// `trade_count` at the time of purchase.
#[account]
#[derive(InitSpace)]
pub struct TradeRecord {
    pub listing: Pubkey,
    /// Source of the shares. For a primary sale this is the artist/listing.
    pub from: Pubkey,
    /// Buyer.
    pub to: Pubkey,
    pub shares_amount: u64,
    /// Amount settled **off-chain** for this trade, in settlement-currency minor units
    /// (gross, incl. any platform fee). Recorded from the API — this program moves no money.
    pub settlement_amount: u64,
    /// Caller-supplied off-chain/off-ramp payment reference — NOT the on-chain signature
    /// (a program cannot read its own tx hash at runtime).
    pub payment_tx_hash: [u8; 64],
    pub timestamp: i64,
    pub trade_type: TradeType,
    /// Always true for records this program writes (the sale passed every check first);
    /// kept for a uniform off-chain audit schema.
    pub compliance_approved: bool,
    pub bump: u8,
}

/// Per-listing compliance knobs. **PDA:** `["compliance", share_mint]`.
///
/// Deliberately seeded by `share_mint` (not `listing`) so the transfer hook — which only
/// has the mint in hand during a transfer — can derive it. Written by the compliance
/// authority (`block_user` / `unblock_user` / `update_compliance`).
#[account]
#[derive(InitSpace)]
pub struct ComplianceConfig {
    /// The listing this config governs. The hook reads the listing's address from here
    /// (via `PubkeyData`) to reach `total_shares` / jurisdictions / accreditation.
    pub listing: Pubkey,
    /// The share mint; also the PDA seed. The hook asserts this matches the mint moving.
    pub share_mint: Pubkey,
    /// Per-wallet share cap for this listing. `0` = unlimited.
    pub max_shares_per_wallet: u64,
    /// Sanctions/AML blocklist. Neither sender nor recipient may be on it.
    /// Bounded to keep the account size fixed and the scan cheap.
    #[max_len(MAX_BLOCKED_USERS)]
    pub blocked_users: Vec<Pubkey>,
    pub bump: u8,
}

impl ComplianceConfig {
    /// True if `user` is on this listing's blocklist. O(n) over a bounded list.
    pub fn is_blocked(&self, user: &Pubkey) -> bool {
        self.blocked_users.iter().any(|u| u == user)
    }
}

/// Per-holder lockup record for a listing. **PDA:** `["position", share_mint, owner]`.
///
/// Created on a primary buy and read by the transfer hook to enforce the mandatory hold.
/// It no longer tracks share balances or royalty entitlement: the SPL token account is the
/// authority on holdings, and royalties are computed off-chain from live balances at
/// distribution time (which is what retires the old AUDIT F1/F7 caveats — there is no vault
/// and no primary-vs-live divergence to be unfair about).
#[account]
#[derive(InitSpace)]
pub struct HolderPosition {
    /// Position owner; pinned on first init and used as a PDA seed.
    pub owner: Pubkey,
    pub share_mint: Pubkey,
    /// `now + listing.lockup_seconds` at the last purchase; the hook blocks sends before it.
    pub unlock_time: i64,
    pub bump: u8,
}

/// An immutable record of a royalty distribution that the platform paid **off-chain**.
/// **PDA:** `["distribution", listing, index]`.
///
/// The program moves no funds. This exists so the payout is on the public ledger and
/// verifiable: `merkle_root` optionally commits to the exact per-holder payout list, so any
/// holder can later prove they were paid the right amount without the list being published.
#[account]
#[derive(InitSpace)]
pub struct DistributionRecord {
    pub listing: Pubkey,
    /// Sequential index within the listing (the PDA seed).
    pub index: u64,
    /// Total distributed in settlement-currency minor units.
    pub total_amount: u64,
    /// Commitment to the per-holder payout breakdown, or all-zero if none supplied.
    pub merkle_root: [u8; 32],
    pub timestamp: i64,
    /// Off-chain payout-batch reference (e.g. a banking/ledger batch id).
    pub reference: [u8; 64],
    pub bump: u8,
}
