//! `record_distribution` — write a royalty payout to the ledger.
//!
//! **This program moves no money.** The platform pays holders off-chain (pro-rata on their
//! *live* token balances at distribution time, computed by the API/indexer) and then calls
//! this to put the event on the public record. That off-chain, live-balance basis is what
//! retires the old vault design's fairness problems (AUDIT F1/F7): there is no vault to be
//! insolvent or to strand, and entitlement can't drift from actual holdings.
//!
//! `merkle_root` optionally commits to the exact per-holder payout list, so any holder can
//! later prove they were paid correctly without the whole list being published on-chain.
//!
//! Gated to the platform **ops authority** (`global_config.authority`) — recording a payout
//! is a platform action, not a per-user one.

use anchor_lang::prelude::*;

use crate::constants::{DISTRIBUTION_SEED, GLOBAL_CONFIG_SEED, LISTING_SEED};
use crate::error::RoyaltyError;
use crate::events::RoyaltyDistributed;
use crate::state::{DistributionRecord, GlobalConfig, SongListing};

#[derive(Accounts)]
pub struct RecordDistribution<'info> {
    #[account(mut)]
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

    /// Sequential per-listing record; `init` on the current index guarantees uniqueness and
    /// prevents a replay from overwriting a prior distribution.
    #[account(
        init,
        payer = authority,
        space = 8 + DistributionRecord::INIT_SPACE,
        seeds = [DISTRIBUTION_SEED, listing.key().as_ref(), listing.total_distributions.to_le_bytes().as_ref()],
        bump
    )]
    pub distribution: Account<'info, DistributionRecord>,

    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<RecordDistribution>,
    total_amount: u64,
    merkle_root: [u8; 32],
    reference: [u8; 64],
) -> Result<()> {
    require!(total_amount > 0, RoyaltyError::ZeroAmount);

    let listing = &mut ctx.accounts.listing;
    let index = listing.total_distributions;

    let d = &mut ctx.accounts.distribution;
    d.listing = listing.key();
    d.index = index;
    d.total_amount = total_amount;
    d.merkle_root = merkle_root;
    d.timestamp = Clock::get()?.unix_timestamp;
    d.reference = reference;
    d.bump = ctx.bumps.distribution;

    listing.cumulative_royalties = listing
        .cumulative_royalties
        .checked_add(total_amount)
        .ok_or(RoyaltyError::MathOverflow)?;
    listing.total_distributions = index.checked_add(1).ok_or(RoyaltyError::MathOverflow)?;

    emit!(RoyaltyDistributed { listing: listing.key(), index, total_amount });
    Ok(())
}
