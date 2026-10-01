//! Admin & compliance instructions, grouped by which authority may call them.
//!
//! - **Compliance authority** (`UpdateComplianceCfg`, `has_one = compliance_authority`):
//!   `block_user`, `unblock_user`, `update_compliance`.
//! - **Ops authority** (`has_one = authority`): `set_listing_status`, `set_global_pause`.
//!
//! Each `Accounts` struct re-derives its target PDA from the account's own immutable
//! fields (self-referential seeds), so a caller can't substitute a different config/listing.

use anchor_lang::prelude::*;

use crate::constants::{COMPLIANCE_SEED, GLOBAL_CONFIG_SEED, LISTING_SEED};
use crate::error::RoyaltyError;
use crate::events::{
    ComplianceUpdated, GlobalPauseChanged, ListingStatusChanged, PlatformFeeUpdated, UserBlocked,
    UserUnblocked,
};
use crate::state::{ComplianceConfig, GlobalConfig, ListingStatus, SongListing};

// ---------------- Compliance-authority gated ----------------

#[derive(Accounts)]
pub struct UpdateComplianceCfg<'info> {
    pub compliance_authority: Signer<'info>,

    #[account(
        seeds = [GLOBAL_CONFIG_SEED],
        bump = global_config.bump,
        has_one = compliance_authority @ RoyaltyError::Unauthorized,
    )]
    pub global_config: Account<'info, GlobalConfig>,

    #[account(
        mut,
        seeds = [COMPLIANCE_SEED, compliance_config.share_mint.as_ref()],
        bump = compliance_config.bump,
    )]
    pub compliance_config: Account<'info, ComplianceConfig>,
}

pub fn block_user(ctx: Context<UpdateComplianceCfg>, user: Pubkey) -> Result<()> {
    let cc = &mut ctx.accounts.compliance_config;
    if cc.is_blocked(&user) {
        return Ok(());
    }
    require!(
        cc.blocked_users.len() < crate::constants::MAX_BLOCKED_USERS,
        RoyaltyError::BlockedListFull
    );
    cc.blocked_users.push(user);
    emit!(UserBlocked { share_mint: cc.share_mint, user });
    Ok(())
}

pub fn unblock_user(ctx: Context<UpdateComplianceCfg>, user: Pubkey) -> Result<()> {
    let cc = &mut ctx.accounts.compliance_config;
    cc.blocked_users.retain(|u| *u != user);
    emit!(UserUnblocked { share_mint: cc.share_mint, user });
    Ok(())
}

pub fn update_compliance(
    ctx: Context<UpdateComplianceCfg>,
    max_shares_per_wallet: u64,
) -> Result<()> {
    ctx.accounts.compliance_config.max_shares_per_wallet = max_shares_per_wallet;
    emit!(ComplianceUpdated {
        share_mint: ctx.accounts.compliance_config.share_mint,
        max_shares_per_wallet,
    });
    Ok(())
}

// ---------------- Ops-authority gated ----------------

#[derive(Accounts)]
pub struct SetListingStatus<'info> {
    pub authority: Signer<'info>,

    #[account(
        seeds = [GLOBAL_CONFIG_SEED],
        bump = global_config.bump,
        has_one = authority @ RoyaltyError::Unauthorized,
    )]
    pub global_config: Account<'info, GlobalConfig>,

    #[account(
        mut,
        seeds = [LISTING_SEED, listing.artist.as_ref(), listing.song_id.as_ref()],
        bump = listing.bump,
    )]
    pub listing: Account<'info, SongListing>,
}

pub fn set_listing_status(ctx: Context<SetListingStatus>, status: ListingStatus) -> Result<()> {
    ctx.accounts.listing.status = status;
    emit!(ListingStatusChanged { listing: ctx.accounts.listing.key(), status });
    Ok(())
}

#[derive(Accounts)]
pub struct SetGlobalPause<'info> {
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [GLOBAL_CONFIG_SEED],
        bump = global_config.bump,
        has_one = authority @ RoyaltyError::Unauthorized,
    )]
    pub global_config: Account<'info, GlobalConfig>,
}

pub fn set_global_pause(ctx: Context<SetGlobalPause>, paused: bool) -> Result<()> {
    ctx.accounts.global_config.is_paused = paused;
    emit!(GlobalPauseChanged { paused });
    Ok(())
}

/// Adjust the platform fee taken on sales. Ops-authority gated, and capped at 100%.
/// Existing listings pick up the new rate on their next sale — the fee is read from
/// `GlobalConfig` at execution time, not snapshotted per listing.
pub fn update_platform_fee(ctx: Context<SetGlobalPause>, platform_fee_bps: u16) -> Result<()> {
    require!(
        (platform_fee_bps as u64) <= crate::constants::BPS_DENOMINATOR,
        RoyaltyError::InvalidFeeBps
    );
    ctx.accounts.global_config.platform_fee_bps = platform_fee_bps;
    emit!(PlatformFeeUpdated { platform_fee_bps });
    Ok(())
}
