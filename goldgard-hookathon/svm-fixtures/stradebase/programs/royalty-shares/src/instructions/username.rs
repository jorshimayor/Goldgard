//! Username claims — the public half of the identity layer.
//!
//! A wallet address is unavoidably public; a username makes it *legible*. Both live
//! on-chain by design. Everything else about a person is committed to as a salted hash on
//! [`IdentityRegistry`](crate::state::IdentityRegistry) and never published. See
//! `docs/architecture.md`.
//!
//! **Uniqueness is enforced by the runtime, not by us.** The claim record is a PDA seeded
//! by the name itself, so a second `claim_username` for a taken name hits Anchor's `init`
//! on an already-initialized address and fails atomically. There is no reservation table
//! and no check-then-write window for two concurrent signups to slip through.
//!
//! That trick only holds because [`validate`] restricts the charset — see its docs.

use anchor_lang::prelude::*;

use crate::constants::{MAX_USERNAME_LEN, MIN_USERNAME_LEN, USERNAME_SEED, USER_PROFILE_SEED};
use crate::error::RoyaltyError;
use crate::events::{UsernameClaimed, UsernameReleased};
use crate::state::{UserProfile, UsernameRecord};

/// Enforce `[a-z0-9_]{3,32}`.
///
/// Restrictive on purpose. Allowing uppercase or Unicode would mean normalizing before
/// hashing to a seed, and normalization is where impersonation attacks live: `Josh`,
/// `josh`, and `jоsh` (Cyrillic `о`, U+043E) are three distinct byte strings that render
/// identically. With this charset each displayed name has exactly one representation, so
/// the collision class is empty rather than merely detected — and the raw bytes stay
/// usable as a PDA seed, which is what buys us runtime-enforced uniqueness.
///
/// The 32-byte ceiling is also a hard protocol limit: PDA seeds cannot exceed it.
fn validate(username: &str) -> Result<()> {
    let bytes = username.as_bytes();
    require!(
        bytes.len() >= MIN_USERNAME_LEN && bytes.len() <= MAX_USERNAME_LEN,
        RoyaltyError::UsernameLength
    );
    require!(
        bytes
            .iter()
            .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || *b == b'_'),
        RoyaltyError::UsernameInvalidCharacter
    );
    Ok(())
}

#[derive(Accounts)]
#[instruction(username: String)]
pub struct ClaimUsername<'info> {
    /// Funds the rent — the platform fee payer, or the user themselves.
    #[account(mut)]
    pub payer: Signer<'info>,

    /// The wallet claiming the name. Signs to prove consent: publishing a handle against
    /// an address is a privacy decision, so it can't be made for someone.
    pub user: Signer<'info>,

    #[account(
        mut,
        seeds = [USER_PROFILE_SEED, user.key().as_ref()],
        bump = profile.bump,
        has_one = user,
    )]
    pub profile: Account<'info, UserProfile>,

    /// The claim itself. `init` here is the uniqueness check — see the module docs.
    #[account(
        init,
        payer = payer,
        space = 8 + UsernameRecord::INIT_SPACE,
        seeds = [USERNAME_SEED, username.as_bytes()],
        bump
    )]
    pub username_record: Account<'info, UsernameRecord>,

    pub system_program: Program<'info, System>,
}

pub fn claim(ctx: Context<ClaimUsername>, username: String) -> Result<()> {
    validate(&username)?;
    // One name per profile: without this, a user could strand rent in orphaned records
    // that `release_username` (which reads the profile's copy) could never reach.
    require!(
        ctx.accounts.profile.username.is_empty(),
        RoyaltyError::UsernameAlreadyClaimed
    );

    let record = &mut ctx.accounts.username_record;
    record.owner = ctx.accounts.user.key();
    record.claimed_at = Clock::get()?.unix_timestamp;
    record.bump = ctx.bumps.username_record;

    ctx.accounts.profile.username = username.clone();
    emit!(UsernameClaimed { user: ctx.accounts.user.key(), username });
    Ok(())
}

#[derive(Accounts)]
#[instruction(username: String)]
pub struct ReleaseUsername<'info> {
    /// Receives the reclaimed rent.
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        mut,
        seeds = [USER_PROFILE_SEED, user.key().as_ref()],
        bump = profile.bump,
        has_one = user,
    )]
    pub profile: Account<'info, UserProfile>,

    /// The `owner` constraint stops one wallet releasing another's name; `close` frees the
    /// address so the name becomes claimable again.
    #[account(
        mut,
        close = user,
        seeds = [USERNAME_SEED, username.as_bytes()],
        bump = username_record.bump,
        constraint = username_record.owner == user.key() @ RoyaltyError::Unauthorized,
    )]
    pub username_record: Account<'info, UsernameRecord>,
}

pub fn release(ctx: Context<ReleaseUsername>, username: String) -> Result<()> {
    // The seed already proves the record matches `username`; this proves the *profile*
    // does too, so releasing can't leave a stale handle behind on the profile.
    require!(
        ctx.accounts.profile.username == username,
        RoyaltyError::UsernameMismatch
    );
    ctx.accounts.profile.username = String::new();
    emit!(UsernameReleased { user: ctx.accounts.user.key(), username });
    Ok(())
}
