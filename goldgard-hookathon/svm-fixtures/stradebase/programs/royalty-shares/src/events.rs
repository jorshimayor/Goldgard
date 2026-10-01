//! Program events. Emitted with `emit!` on every state change so off-chain indexers and
//! dashboards can observe transitions in real time (in addition to reading account state).
//! Events are additive and carry only public data — never PII.

use anchor_lang::prelude::*;

use crate::state::{ComplianceStatus, ListingStatus, UserRole};

#[event]
pub struct ListingCreated {
    pub listing: Pubkey,
    pub artist: Pubkey,
    pub total_shares: u64,
    pub price_per_share: u64,
}

#[event]
pub struct SharesPurchased {
    pub listing: Pubkey,
    pub buyer: Pubkey,
    pub shares: u64,
    /// Amount settled off-chain, recorded as data.
    pub settlement_amount: u64,
}

#[event]
pub struct SecondaryTradeRecorded {
    pub listing: Pubkey,
    pub seller: Pubkey,
    pub buyer: Pubkey,
    pub shares: u64,
    pub settlement_amount: u64,
}

#[event]
pub struct RoyaltyDistributed {
    pub listing: Pubkey,
    pub index: u64,
    pub total_amount: u64,
}

#[event]
pub struct IdentityRegistered {
    pub user: Pubkey,
    pub kyc_level: u8,
    pub status: ComplianceStatus,
    pub pii_version: u16,
}

#[event]
pub struct PiiCommitmentUpdated {
    pub user: Pubkey,
    pub pii_version: u16,
}

#[event]
pub struct UserProfileCreated {
    pub user: Pubkey,
    pub role: UserRole,
}

#[event]
pub struct UserRoleUpdated {
    pub user: Pubkey,
    pub role: UserRole,
}

#[event]
pub struct UsernameClaimed {
    pub user: Pubkey,
    pub username: String,
}

#[event]
pub struct UsernameReleased {
    pub user: Pubkey,
    pub username: String,
}

#[event]
pub struct ComplianceUpdated {
    pub share_mint: Pubkey,
    pub max_shares_per_wallet: u64,
}

#[event]
pub struct UserBlocked {
    pub share_mint: Pubkey,
    pub user: Pubkey,
}

#[event]
pub struct UserUnblocked {
    pub share_mint: Pubkey,
    pub user: Pubkey,
}

#[event]
pub struct ListingStatusChanged {
    pub listing: Pubkey,
    pub status: ListingStatus,
}

#[event]
pub struct GlobalPauseChanged {
    pub paused: bool,
}

#[event]
pub struct PlatformFeeUpdated {
    pub platform_fee_bps: u16,
}
