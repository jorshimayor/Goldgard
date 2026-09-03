//! `buy_shares` — primary issuance, the compliance-critical hot path.
//!
//! **This program moves no money.** Payment for the shares is taken off-chain by the API
//! before this instruction is called; here we only *issue the asset and record the trade*.
//! The amount paid and the payment reference are recorded on the `TradeRecord` as data.
//!
//! Flow (all in one transaction, any failure reverts everything):
//! 1. **Gate** — global pause, listing active + within its sale window, supply remaining.
//! 2. **Compliance on the buyer** — status OK, KYC ≥ 1, accredited (if required),
//!    jurisdiction allowed, not blocked.
//! 3. **Caps** — buyer's resulting balance ≤ per-wallet cap and ≤ global bps cap.
//! 4. **Mint** — issue the shares to the buyer, signed by the listing PDA (the mint authority).
//! 5. **Bookkeep** — advance `shares_minted` (→ `SoldOut` when full), open/extend the
//!    buyer's `HolderPosition` (lockup), and write an immutable `TradeRecord`.
//!
//! NB: minting does not trigger the transfer hook (only *transfers* do), which is why the
//! full compliance set is re-checked here rather than relying on the hook for primary sales.
//!
//! Every account below is `Box`ed: this struct is large, and un-boxed it blows the 4 KB
//! SBF stack frame during account validation (see AUDIT / the git history for the fix).

use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token_2022::Token2022;
use anchor_spl::token_interface::{mint_to, Mint, MintTo, TokenAccount};

use crate::constants::*;
use crate::error::RoyaltyError;
use crate::events::SharesPurchased;
use crate::state::*;

#[derive(Accounts)]
pub struct BuyShares<'info> {
    #[account(mut)]
    pub buyer: Signer<'info>,

    #[account(seeds = [GLOBAL_CONFIG_SEED], bump = global_config.bump)]
    pub global_config: Box<Account<'info, GlobalConfig>>,

    #[account(
        mut,
        seeds = [LISTING_SEED, listing.artist.as_ref(), listing.song_id.as_ref()],
        bump = listing.bump,
    )]
    pub listing: Box<Account<'info, SongListing>>,

    #[account(
        seeds = [IDENTITY_SEED, buyer.key().as_ref()],
        bump = buyer_identity.bump,
    )]
    pub buyer_identity: Box<Account<'info, IdentityRegistry>>,

    #[account(
        seeds = [COMPLIANCE_SEED, share_mint.key().as_ref()],
        bump = compliance_config.bump,
    )]
    pub compliance_config: Box<Account<'info, ComplianceConfig>>,

    #[account(
        mut,
        address = listing.share_mint,
        mint::token_program = token_2022_program,
    )]
    pub share_mint: Box<InterfaceAccount<'info, Mint>>,

    #[account(
        init_if_needed,
        payer = buyer,
        associated_token::mint = share_mint,
        associated_token::authority = buyer,
        associated_token::token_program = token_2022_program,
    )]
    pub buyer_share_ata: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(
        init_if_needed,
        payer = buyer,
        space = 8 + HolderPosition::INIT_SPACE,
        seeds = [POSITION_SEED, share_mint.key().as_ref(), buyer.key().as_ref()],
        bump
    )]
    pub position: Box<Account<'info, HolderPosition>>,

    /// The buyer's platform profile (created at signup). Its trade counter is bumped here;
    /// full per-user history comes from indexing `TradeRecord` by `from`/`to`.
    #[account(
        mut,
        seeds = [USER_PROFILE_SEED, buyer.key().as_ref()],
        bump = buyer_profile.bump,
    )]
    pub buyer_profile: Box<Account<'info, UserProfile>>,

    #[account(
        init,
        payer = buyer,
        space = 8 + TradeRecord::INIT_SPACE,
        seeds = [TRADE_SEED, listing.key().as_ref(), listing.total_trades.to_le_bytes().as_ref()],
        bump
    )]
    pub trade_record: Box<Account<'info, TradeRecord>>,

    pub token_2022_program: Program<'info, Token2022>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<BuyShares>,
    shares_amount: u64,
    settlement_amount: u64,
    payment_tx_hash: [u8; 64],
) -> Result<()> {
    require!(shares_amount > 0, RoyaltyError::ZeroAmount);

    let now = Clock::get()?.unix_timestamp;
    let gc = &ctx.accounts.global_config;
    require!(!gc.is_paused, RoyaltyError::GlobalPaused);

    // ----- Listing state / window -----
    {
        let listing = &ctx.accounts.listing;
        require!(
            listing.status == ListingStatus::Active,
            RoyaltyError::ListingNotActive
        );
        require!(now >= listing.start_time, RoyaltyError::SaleNotStarted);
        if let Some(end) = listing.end_time {
            require!(now <= end, RoyaltyError::SaleEnded);
        }
        require!(
            listing
                .shares_minted
                .checked_add(shares_amount)
                .ok_or(RoyaltyError::MathOverflow)?
                <= listing.total_shares,
            RoyaltyError::InsufficientShares
        );
    }

    // ----- Compliance checks on the buyer -----
    {
        let id = &ctx.accounts.buyer_identity;
        require!(id.status.can_buy(), RoyaltyError::ComplianceBlocked);
        require!(id.kyc_level >= 1, RoyaltyError::KycRequired);
        let listing = &ctx.accounts.listing;
        if listing.requires_accredited {
            require!(id.accredited, RoyaltyError::AccreditationRequired);
        }
        if !listing.allowed_jurisdictions.is_empty() {
            require!(
                listing
                    .allowed_jurisdictions
                    .iter()
                    .any(|j| *j == id.jurisdiction),
                RoyaltyError::JurisdictionNotAllowed
            );
        }
        require!(
            !ctx.accounts.compliance_config.is_blocked(&ctx.accounts.buyer.key()),
            RoyaltyError::Sanctioned
        );
    }

    // ----- Ownership caps -----
    // `buyer_share_ata.amount` is the buyer's balance *before* this purchase's mint (the
    // mint happens further down), so `current + shares_amount` is their resulting balance.
    // Caps are per token account; a determined whale can still Sybil across wallets (F2).
    let new_balance = ctx
        .accounts
        .buyer_share_ata
        .amount
        .checked_add(shares_amount)
        .ok_or(RoyaltyError::MathOverflow)?;
    {
        let cc = &ctx.accounts.compliance_config;
        if cc.max_shares_per_wallet > 0 {
            require!(
                new_balance <= cc.max_shares_per_wallet,
                RoyaltyError::ExceedsWalletCap
            );
        }
        let global_cap = (ctx.accounts.listing.total_shares as u128)
            .checked_mul(gc.max_global_ownership_bps as u128)
            .ok_or(RoyaltyError::MathOverflow)?
            / BPS_DENOMINATOR as u128;
        if global_cap > 0 {
            require!(new_balance as u128 <= global_cap, RoyaltyError::ExceedsGlobalCap);
        }
    }

    // ----- Mint the shares (listing PDA is the mint authority) -----
    let artist_key = ctx.accounts.listing.artist;
    let song_id = ctx.accounts.listing.song_id;
    let listing_bump = ctx.accounts.listing.bump;
    let listing_seeds: &[&[u8]] = &[
        LISTING_SEED,
        artist_key.as_ref(),
        song_id.as_ref(),
        std::slice::from_ref(&listing_bump),
    ];
    let signer_seeds = &[listing_seeds];

    mint_to(
        CpiContext::new_with_signer(
            ctx.accounts.token_2022_program.key(),
            MintTo {
                mint: ctx.accounts.share_mint.to_account_info(),
                to: ctx.accounts.buyer_share_ata.to_account_info(),
                authority: ctx.accounts.listing.to_account_info(),
            },
            signer_seeds,
        ),
        shares_amount,
    )?;

    // ----- Update listing / position / audit trail -----
    let lockup = ctx.accounts.listing.lockup_seconds;

    let listing = &mut ctx.accounts.listing;
    listing.shares_minted = listing
        .shares_minted
        .checked_add(shares_amount)
        .ok_or(RoyaltyError::MathOverflow)?;
    if listing.shares_minted == listing.total_shares {
        listing.status = ListingStatus::SoldOut;
    }
    let trade_index = listing.total_trades;
    listing.total_trades = listing
        .total_trades
        .checked_add(1)
        .ok_or(RoyaltyError::MathOverflow)?;

    let position = &mut ctx.accounts.position;
    // First-touch init guard: `position` uses `init_if_needed`, so on a repeat purchase it
    // already exists. Only set the immutable identity fields when the account is fresh
    // (owner still zeroed) — this prevents an attacker-crafted reinit from hijacking it.
    if position.owner == Pubkey::default() {
        position.owner = ctx.accounts.buyer.key();
        position.share_mint = ctx.accounts.share_mint.key();
        position.bump = ctx.bumps.position;
    }
    // Lockup restarts on every purchase (the most recently bought shares gate the whole
    // position). `lockup_seconds` is validated ≤ i64::MAX at listing creation, so this cast
    // never goes negative. The position is purely the lockup record now; holdings live in
    // the SPL token account.
    position.unlock_time = now
        .checked_add(lockup as i64)
        .ok_or(RoyaltyError::MathOverflow)?;

    let tr = &mut ctx.accounts.trade_record;
    tr.listing = listing.key();
    tr.from = listing.artist; // primary issuance originates from the artist/listing
    tr.to = ctx.accounts.buyer.key();
    tr.shares_amount = shares_amount;
    tr.settlement_amount = settlement_amount; // recorded from the off-chain payment
    tr.payment_tx_hash = payment_tx_hash;
    tr.timestamp = now;
    tr.trade_type = TradeType::Primary;
    tr.compliance_approved = true;
    tr.bump = ctx.bumps.trade_record;

    // Platform activity counter on the buyer's profile.
    let profile = &mut ctx.accounts.buyer_profile;
    profile.trades_count = profile
        .trades_count
        .checked_add(1)
        .ok_or(RoyaltyError::MathOverflow)?;

    emit!(SharesPurchased {
        listing: ctx.accounts.listing.key(),
        buyer: ctx.accounts.buyer.key(),
        shares: shares_amount,
        settlement_amount,
    });

    let _ = trade_index;
    Ok(())
}
