//! `initialize_global` — one-time platform bootstrap.
//!
//! Creates the singleton `GlobalConfig`. Gated to the program's **upgrade authority**
//! (the `program` + `program_data` accounts prove the signer controls the deployed
//! program) so that a bystander cannot front-run the very first init and seize the
//! platform + compliance authorities (AUDIT F4). Deploy and call this atomically.

use anchor_lang::prelude::*;

use crate::constants::{BPS_DENOMINATOR, GLOBAL_CONFIG_SEED};
use crate::error::RoyaltyError;
use crate::state::GlobalConfig;

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct InitializeGlobalParams {
    pub compliance_authority: Pubkey,
    pub treasury: Pubkey,
    pub sbst_mint: Pubkey,
    pub platform_fee_bps: u16,
    pub max_global_ownership_bps: u16,
}

#[derive(Accounts)]
pub struct InitializeGlobal<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        init,
        payer = authority,
        space = 8 + GlobalConfig::INIT_SPACE,
        seeds = [GLOBAL_CONFIG_SEED],
        bump
    )]
    pub global_config: Account<'info, GlobalConfig>,

    // Gate bootstrap to the program's upgrade authority so the singleton can't be
    // seized by a front-runner right after deploy.
    #[account(
        constraint = program.programdata_address()? == Some(program_data.key())
            @ RoyaltyError::Unauthorized
    )]
    pub program: Program<'info, crate::program::RoyaltyShares>,

    #[account(
        constraint = program_data.upgrade_authority_address == Some(authority.key())
            @ RoyaltyError::Unauthorized
    )]
    pub program_data: Account<'info, ProgramData>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<InitializeGlobal>, params: InitializeGlobalParams) -> Result<()> {
    require!(
        (params.platform_fee_bps as u64) <= BPS_DENOMINATOR,
        RoyaltyError::InvalidFeeBps
    );
    require!(
        (params.max_global_ownership_bps as u64) <= BPS_DENOMINATOR,
        RoyaltyError::InvalidFeeBps
    );

    let cfg = &mut ctx.accounts.global_config;
    cfg.authority = ctx.accounts.authority.key();
    cfg.compliance_authority = params.compliance_authority;
    cfg.treasury = params.treasury;
    cfg.sbst_mint = params.sbst_mint;
    cfg.platform_fee_bps = params.platform_fee_bps;
    cfg.max_global_ownership_bps = params.max_global_ownership_bps;
    cfg.is_paused = false;
    cfg.bump = ctx.bumps.global_config;
    Ok(())
}
