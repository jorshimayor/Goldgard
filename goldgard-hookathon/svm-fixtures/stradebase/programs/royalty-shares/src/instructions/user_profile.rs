//! User onboarding: the platform profile that records a wallet's role and activity.
//!
//! Separate from [`IdentityRegistry`](crate::state::IdentityRegistry): the profile is
//! **user-owned** (created at signup, role chosen by the user) while the identity record is
//! **compliance-owned** (KYC written by the compliance authority). Buying requires KYC; creating a
//! listing requires an Artist/Both profile.
//!
//! Because key custody is custodial, the backend can create this at signup by signing as both the
//! `payer` and the `user` — no user interaction needed. `payer` is separate so a platform fee-payer
//! can fund the rent instead of the user.
//!
//! **Privacy:** on-chain accounts are public. Only role + counters live here; PII stays off-chain.

use anchor_lang::prelude::*;

use crate::constants::USER_PROFILE_SEED;
use crate::events::{UserProfileCreated, UserRoleUpdated};
use crate::state::{UserProfile, UserRole};

#[derive(Accounts)]
pub struct CreateUserProfile<'info> {
    /// Funds the rent (the platform's fee payer, or the user themselves).
    #[account(mut)]
    pub payer: Signer<'info>,

    /// The wallet the profile is for. Signs to prove consent.
    pub user: Signer<'info>,

    #[account(
        init,
        payer = payer,
        space = 8 + UserProfile::INIT_SPACE,
        seeds = [USER_PROFILE_SEED, user.key().as_ref()],
        bump
    )]
    pub profile: Account<'info, UserProfile>,

    pub system_program: Program<'info, System>,
}

pub fn create(ctx: Context<CreateUserProfile>, role: UserRole) -> Result<()> {
    let p = &mut ctx.accounts.profile;
    p.user = ctx.accounts.user.key();
    p.username = String::new(); // opt-in, claimed separately via `claim_username`
    p.role = role;
    p.created_at = Clock::get()?.unix_timestamp;
    p.listings_created = 0;
    p.trades_count = 0;
    p.bump = ctx.bumps.profile;
    emit!(UserProfileCreated { user: ctx.accounts.user.key(), role });
    Ok(())
}

#[derive(Accounts)]
pub struct UpdateUserRole<'info> {
    /// Only the profile owner may change their own role.
    pub user: Signer<'info>,

    #[account(
        mut,
        seeds = [USER_PROFILE_SEED, user.key().as_ref()],
        bump = profile.bump,
        has_one = user,
    )]
    pub profile: Account<'info, UserProfile>,
}

pub fn update_role(ctx: Context<UpdateUserRole>, role: UserRole) -> Result<()> {
    ctx.accounts.profile.role = role;
    emit!(UserRoleUpdated { user: ctx.accounts.user.key(), role });
    Ok(())
}
