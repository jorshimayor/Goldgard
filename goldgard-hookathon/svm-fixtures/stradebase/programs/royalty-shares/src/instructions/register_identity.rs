//! `register_identity` — the compliance authority's write path into the KYC registry.
//!
//! Uses `init_if_needed` so one instruction both creates and updates a record. Safe here
//! because (a) only the `compliance_authority` (enforced by `has_one`) can call it, and
//! (b) the immutable `user`/`bump` fields are pinned only on first init. A KYC oracle
//! typically drives this off-chain.

use anchor_lang::prelude::*;

use crate::constants::{COMMITMENT_SHA256_SALTED, GLOBAL_CONFIG_SEED, IDENTITY_SEED};
use crate::error::RoyaltyError;
use crate::events::{IdentityRegistered, PiiCommitmentUpdated};
use crate::state::{ComplianceStatus, GlobalConfig, IdentityRegistry};

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct RegisterIdentityParams {
    pub kyc_level: u8,
    pub jurisdiction: [u8; 2],
    /// Transactional standing. Reason-free by design — see [`ComplianceStatus`].
    pub status: ComplianceStatus,
    pub accredited: bool,
    /// `sha256(salt || canonical_json(pii))`, or `None` to leave the existing commitment
    /// untouched (e.g. a status change that doesn't re-verify the underlying documents).
    pub pii_commitment: Option<[u8; 32]>,
}

#[derive(Accounts)]
#[instruction(params: RegisterIdentityParams)]
pub struct RegisterIdentity<'info> {
    #[account(mut)]
    pub compliance_authority: Signer<'info>,

    #[account(
        seeds = [GLOBAL_CONFIG_SEED],
        bump = global_config.bump,
        has_one = compliance_authority @ RoyaltyError::Unauthorized,
    )]
    pub global_config: Account<'info, GlobalConfig>,

    /// CHECK: the wallet whose identity is being (de)registered; used only as a seed.
    pub user: UncheckedAccount<'info>,

    #[account(
        init_if_needed,
        payer = compliance_authority,
        space = 8 + IdentityRegistry::INIT_SPACE,
        seeds = [IDENTITY_SEED, user.key().as_ref()],
        bump
    )]
    pub identity: Account<'info, IdentityRegistry>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<RegisterIdentity>, params: RegisterIdentityParams) -> Result<()> {
    let identity = &mut ctx.accounts.identity;

    // On first init the account is zeroed; pin the immutable fields once.
    if identity.user == Pubkey::default() {
        identity.user = ctx.accounts.user.key();
        identity.bump = ctx.bumps.identity;
    }

    identity.kyc_level = params.kyc_level;
    identity.jurisdiction = params.jurisdiction;
    identity.status = params.status;
    identity.accredited = params.accredited;
    identity.last_verified = Clock::get()?.unix_timestamp;

    if let Some(commitment) = params.pii_commitment {
        set_commitment(identity, commitment)?;
    }

    emit!(IdentityRegistered {
        user: identity.user,
        kyc_level: identity.kyc_level,
        status: identity.status,
        pii_version: identity.pii_version,
    });
    Ok(())
}

/// Write a new PII commitment, bumping `pii_version` only when the value actually changes.
///
/// The version is meant to count *re-verifications*, so a status update that re-submits an
/// unchanged commitment must not inflate it — the backend mirrors this counter, and drift
/// between the two is the signal that something was tampered with.
fn set_commitment(identity: &mut IdentityRegistry, commitment: [u8; 32]) -> Result<()> {
    if identity.pii_commitment == commitment {
        return Ok(());
    }
    identity.pii_commitment = commitment;
    identity.commitment_scheme = COMMITMENT_SHA256_SALTED;
    identity.pii_version = identity
        .pii_version
        .checked_add(1)
        .ok_or(RoyaltyError::MathOverflow)?;
    Ok(())
}

/// Update *only* the PII commitment.
///
/// Separate from `register_identity` because re-verifying documents and changing someone's
/// transactional standing are different operations with different review paths. Reusing
/// the combined instruction would force the caller to restate `status`, making an
/// accidental unfreeze one stale field away.
#[derive(Accounts)]
pub struct SetPiiCommitment<'info> {
    pub compliance_authority: Signer<'info>,

    #[account(
        seeds = [GLOBAL_CONFIG_SEED],
        bump = global_config.bump,
        has_one = compliance_authority @ RoyaltyError::Unauthorized,
    )]
    pub global_config: Account<'info, GlobalConfig>,

    #[account(
        mut,
        seeds = [IDENTITY_SEED, identity.user.as_ref()],
        bump = identity.bump,
    )]
    pub identity: Account<'info, IdentityRegistry>,
}

pub fn set_pii_commitment(ctx: Context<SetPiiCommitment>, commitment: [u8; 32]) -> Result<()> {
    set_commitment(&mut ctx.accounts.identity, commitment)?;
    ctx.accounts.identity.last_verified = Clock::get()?.unix_timestamp;
    emit!(PiiCommitmentUpdated {
        user: ctx.accounts.identity.user,
        pii_version: ctx.accounts.identity.pii_version,
    });
    Ok(())
}
