//! `create_listing` — an artist mints a new song "card".
//!
//! The interesting part is that Anchor's `#[account(init, mint::...)]` cannot add
//! arbitrary Token-2022 extensions, so the share mint is built **by hand** in the handler:
//! allocate the account with exactly the space for a base mint + `TransferHook` +
//! `MetadataPointer`, initialize each extension, then `initialize_mint2`. Extensions MUST
//! be initialized before the mint itself — that ordering is load-bearing.
//!
//! The mint is a PDA (`["share_mint", listing]`) with **mint authority = the listing PDA**,
//! so shares can only ever be issued by this program via `buy_shares`. Its transfer-hook
//! extension points at the companion program so every secondary move runs compliance.
//!
//! No SBST royalty vault is created: this program is a ledger of record and moves no money.
//! Royalty payouts happen off-chain and are recorded via `record_distribution`.

use anchor_lang::prelude::*;
use anchor_lang::system_program::{create_account, CreateAccount};
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token_2022::spl_token_2022::{extension::ExtensionType, pod::PodMint};
use anchor_spl::token_2022::{initialize_mint2, InitializeMint2, Token2022};
use anchor_spl::token_2022_extensions::{
    metadata_pointer_initialize, transfer_hook_initialize, MetadataPointerInitialize,
    TransferHookInitialize,
};

use crate::constants::*;
use crate::error::RoyaltyError;
use crate::events::ListingCreated;
use crate::state::{ComplianceConfig, GlobalConfig, ListingStatus, SongListing, UserProfile};

/// Caller-supplied listing parameters. Immutable once the listing is created.
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct CreateListingParams {
    pub song_id: [u8; 32],
    pub metadata_uri: String,
    pub total_shares: u64,
    pub price_per_share: u64,
    pub royalty_percent_sold: u16,
    pub artist_retained_percent: u16,
    pub start_time: i64,
    pub end_time: Option<i64>,
    pub lockup_seconds: u64,
    pub requires_accredited: bool,
    pub allowed_jurisdictions: Vec<[u8; 2]>,
    pub max_shares_per_wallet: u64,
}

#[derive(Accounts)]
#[instruction(params: CreateListingParams)]
pub struct CreateListing<'info> {
    /// Artist creating the listing. Signs, and pays rent for the listing / mint / vault /
    /// compliance accounts. Becomes `listing.artist` and the primary-sale payee.
    #[account(mut)]
    pub artist: Signer<'info>,

    #[account(seeds = [GLOBAL_CONFIG_SEED], bump = global_config.bump)]
    pub global_config: Account<'info, GlobalConfig>,

    /// The artist's platform profile. Must exist and carry an Artist/Both role — this is the
    /// "only Artist or Both may create listings" rule. Counter is bumped in the handler.
    #[account(
        mut,
        seeds = [USER_PROFILE_SEED, artist.key().as_ref()],
        bump = artist_profile.bump,
        constraint = artist_profile.role.can_create_listing() @ RoyaltyError::RoleCannotCreateListing,
    )]
    pub artist_profile: Account<'info, UserProfile>,

    /// The new listing PDA, namespaced by `(artist, song_id)` so two artists can't collide.
    #[account(
        init,
        payer = artist,
        space = 8 + SongListing::INIT_SPACE,
        seeds = [LISTING_SEED, artist.key().as_ref(), params.song_id.as_ref()],
        bump
    )]
    pub listing: Account<'info, SongListing>,

    /// CHECK: Token-2022 share mint. Declared `UncheckedAccount` because Anchor's `init`
    /// can't add extensions — the handler allocates + initializes it manually. It is still
    /// a verified PDA via `seeds`, and its address depends on `listing`, so it's unique.
    #[account(
        mut,
        seeds = [SHARE_MINT_SEED, listing.key().as_ref()],
        bump
    )]
    pub share_mint: UncheckedAccount<'info>,

    #[account(
        init,
        payer = artist,
        space = 8 + ComplianceConfig::INIT_SPACE,
        seeds = [COMPLIANCE_SEED, share_mint.key().as_ref()],
        bump
    )]
    pub compliance_config: Account<'info, ComplianceConfig>,

    /// CHECK: must be the configured transfer-hook program id.
    #[account(
        constraint = transfer_hook_program.key() == TRANSFER_HOOK_PROGRAM_ID
            @ RoyaltyError::InvalidTransferHookProgram
    )]
    pub transfer_hook_program: UncheckedAccount<'info>,

    pub token_2022_program: Program<'info, Token2022>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<CreateListing>, params: CreateListingParams) -> Result<()> {
    require!(
        params.metadata_uri.len() <= MAX_METADATA_URI_LEN,
        RoyaltyError::MetadataUriTooLong
    );
    require!(
        params.allowed_jurisdictions.len() <= MAX_JURISDICTIONS,
        RoyaltyError::TooManyJurisdictions
    );
    require!(params.total_shares > 0, RoyaltyError::ZeroAmount);
    require!(
        params.lockup_seconds <= i64::MAX as u64,
        RoyaltyError::InvalidLockup
    );
    // (Can't overflow — two u16 in a u64 — but checked for consistency and to satisfy linters.)
    let split = (params.royalty_percent_sold as u64)
        .checked_add(params.artist_retained_percent as u64)
        .ok_or(RoyaltyError::MathOverflow)?;
    require!(
        split <= BPS_DENOMINATOR && (params.royalty_percent_sold as u64) <= BPS_DENOMINATOR,
        RoyaltyError::InvalidRoyaltySplit
    );

    let listing_key = ctx.accounts.listing.key();
    let compliance_authority = ctx.accounts.global_config.compliance_authority;

    // ---- Create the Token-2022 share mint with TransferHook + MetadataPointer ----
    let space =
        ExtensionType::try_calculate_account_len::<PodMint>(&[
            ExtensionType::TransferHook,
            ExtensionType::MetadataPointer,
        ])?;
    let lamports = Rent::get()?.minimum_balance(space);

    let mint_bump = ctx.bumps.share_mint;
    let mint_seeds: &[&[u8]] = &[SHARE_MINT_SEED, listing_key.as_ref(), &[mint_bump]];
    let signer_seeds = &[mint_seeds];

    create_account(
        CpiContext::new_with_signer(
            ctx.accounts.system_program.key(),
            CreateAccount {
                from: ctx.accounts.artist.to_account_info(),
                to: ctx.accounts.share_mint.to_account_info(),
            },
            signer_seeds,
        ),
        lamports,
        space as u64,
        &ctx.accounts.token_2022_program.key(),
    )?;

    // Extensions MUST be initialized before initialize_mint2.
    transfer_hook_initialize(
        CpiContext::new(
            ctx.accounts.token_2022_program.key(),
            TransferHookInitialize {
                token_program_id: ctx.accounts.token_2022_program.to_account_info(),
                mint: ctx.accounts.share_mint.to_account_info(),
            },
        ),
        Some(compliance_authority),
        Some(TRANSFER_HOOK_PROGRAM_ID),
    )?;

    metadata_pointer_initialize(
        CpiContext::new(
            ctx.accounts.token_2022_program.key(),
            MetadataPointerInitialize {
                token_program_id: ctx.accounts.token_2022_program.to_account_info(),
                mint: ctx.accounts.share_mint.to_account_info(),
            },
        ),
        Some(ctx.accounts.artist.key()),
        Some(listing_key),
    )?;

    initialize_mint2(
        CpiContext::new(
            ctx.accounts.token_2022_program.key(),
            InitializeMint2 {
                mint: ctx.accounts.share_mint.to_account_info(),
            },
        ),
        SHARE_DECIMALS,
        &listing_key,          // mint authority = listing PDA (program-controlled)
        Some(&compliance_authority), // freeze authority = compliance officer
    )?;

    // ---- Populate the listing ----
    let listing = &mut ctx.accounts.listing;
    listing.artist = ctx.accounts.artist.key();
    listing.song_id = params.song_id;
    listing.metadata_uri = params.metadata_uri;
    listing.total_shares = params.total_shares;
    listing.shares_minted = 0;
    listing.price_per_share = params.price_per_share;
    listing.royalty_percent_sold = params.royalty_percent_sold;
    listing.artist_retained_percent = params.artist_retained_percent;
    listing.start_time = params.start_time;
    listing.end_time = params.end_time;
    listing.status = ListingStatus::Active;
    listing.share_mint = ctx.accounts.share_mint.key();
    listing.lockup_seconds = params.lockup_seconds;
    listing.requires_accredited = params.requires_accredited;
    listing.allowed_jurisdictions = params.allowed_jurisdictions;
    // Track platform activity on the artist's profile (full history comes from indexing).
    ctx.accounts.artist_profile.listings_created = ctx
        .accounts
        .artist_profile
        .listings_created
        .checked_add(1)
        .ok_or(RoyaltyError::MathOverflow)?;

    listing.cumulative_royalties = 0;
    listing.total_distributions = 0;
    listing.total_trades = 0;
    listing.bump = ctx.bumps.listing;

    // ---- Per-listing compliance config ----
    let cc = &mut ctx.accounts.compliance_config;
    cc.listing = listing_key;
    cc.share_mint = ctx.accounts.share_mint.key();
    cc.max_shares_per_wallet = params.max_shares_per_wallet;
    cc.blocked_users = Vec::new();
    cc.bump = ctx.bumps.compliance_config;

    emit!(ListingCreated {
        listing: listing_key,
        artist: ctx.accounts.artist.key(),
        total_shares: params.total_shares,
        price_per_share: params.price_per_share,
    });
    Ok(())
}
