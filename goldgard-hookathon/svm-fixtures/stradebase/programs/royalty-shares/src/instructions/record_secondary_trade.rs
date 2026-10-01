//! `record_secondary_trade` — write a secondary (resale) trade to the on-chain ledger.
//!
//! A resale is a real Token-2022 transfer (backend-signed, compliance-gated by the hook). The
//! program doesn't see that transfer, so on its own the chain has no *structured* record of a
//! resale — only a balance change. This instruction closes that gap so the on-chain ledger holds a
//! complete per-listing history: primary sales (`buy_shares`) and secondary sales share the same
//! `["trade", listing, total_trades]` index space, so one scan yields the full ordered history.
//!
//! **Faithfulness by construction.** The record is not merely trusted from the caller — the handler
//! introspects the current transaction (via the Instructions sysvar) and requires a matching
//! Token-2022 `TransferChecked` (same mint, same amount, authorized by the seller) to be present in
//! the same transaction. The API therefore sends one atomic tx:
//! `[transferChecked(hook), record_secondary_trade]`. No transfer ⇒ no record; the ledger cannot
//! diverge from what actually moved on chain.

use anchor_lang::prelude::*;
use anchor_spl::associated_token::get_associated_token_address_with_program_id;
use anchor_spl::token_2022::Token2022;
use solana_instructions_sysvar::{load_instruction_at_checked, ID as INSTRUCTIONS_SYSVAR_ID};

use crate::constants::{LISTING_SEED, TRADE_SEED};
use crate::error::RoyaltyError;
use crate::events::SecondaryTradeRecorded;
use crate::state::{SongListing, TradeRecord, TradeType};

/// SPL Token / Token-2022 `TransferChecked` instruction discriminator (first data byte).
const SPL_TRANSFER_CHECKED_IX: u8 = 12;
/// Bound the introspection scan; a single transaction never holds this many instructions.
const MAX_TX_INSTRUCTIONS: usize = 64;

#[derive(Accounts)]
pub struct RecordSecondaryTrade<'info> {
    /// The seller — the transfer authority. Signs (the API holds the custodial key) and pays the
    /// record's rent. Requiring the seller's signature ties the ledger entry to the party that
    /// actually authorized the share movement.
    #[account(mut)]
    pub seller: Signer<'info>,

    #[account(
        mut,
        seeds = [LISTING_SEED, listing.artist.as_ref(), listing.song_id.as_ref()],
        bump = listing.bump,
    )]
    pub listing: Box<Account<'info, SongListing>>,

    /// CHECK: recipient of the shares; recorded as `TradeRecord.to`, no constraints needed.
    pub buyer: UncheckedAccount<'info>,

    #[account(
        init,
        payer = seller,
        space = 8 + TradeRecord::INIT_SPACE,
        seeds = [TRADE_SEED, listing.key().as_ref(), listing.total_trades.to_le_bytes().as_ref()],
        bump
    )]
    pub trade_record: Box<Account<'info, TradeRecord>>,

    /// CHECK: the Instructions sysvar, verified by address; read for transaction introspection.
    #[account(address = INSTRUCTIONS_SYSVAR_ID)]
    pub instructions: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<RecordSecondaryTrade>,
    shares_amount: u64,
    settlement_amount: u64,
    payment_tx_hash: [u8; 64],
) -> Result<()> {
    require!(shares_amount > 0, RoyaltyError::ZeroAmount);

    let share_mint = ctx.accounts.listing.share_mint;
    let seller = ctx.accounts.seller.key();
    // The destination the transfer must credit: the buyer's canonical share ATA. Binding this
    // means the recorded `buyer` is provably the transfer's recipient, not just an API claim.
    let buyer_ata = get_associated_token_address_with_program_id(
        &ctx.accounts.buyer.key(),
        &share_mint,
        &Token2022::id(),
    );

    // Prove a matching transfer exists in THIS transaction before recording it.
    require!(
        transfer_present(
            &ctx.accounts.instructions.to_account_info(),
            &share_mint,
            &seller,
            &buyer_ata,
            shares_amount,
        )?,
        RoyaltyError::TransferNotFound
    );

    let listing = &mut ctx.accounts.listing;
    let tr = &mut ctx.accounts.trade_record;
    tr.listing = listing.key();
    tr.from = seller;
    tr.to = ctx.accounts.buyer.key();
    tr.shares_amount = shares_amount;
    tr.settlement_amount = settlement_amount; // recorded from the off-chain payment
    tr.payment_tx_hash = payment_tx_hash;
    tr.timestamp = Clock::get()?.unix_timestamp;
    tr.trade_type = TradeType::Secondary;
    tr.compliance_approved = true; // the transfer passed the hook, which is what let it land
    tr.bump = ctx.bumps.trade_record;

    listing.total_trades = listing
        .total_trades
        .checked_add(1)
        .ok_or(RoyaltyError::MathOverflow)?;

    emit!(SecondaryTradeRecorded {
        listing: listing.key(),
        seller,
        buyer: ctx.accounts.buyer.key(),
        shares: shares_amount,
        settlement_amount,
    });
    Ok(())
}

/// Scan the transaction for a Token-2022 `TransferChecked` of `amount` of `mint` from `authority`
/// to `destination`. Returns `true` on the first match.
///
/// `TransferChecked` account order is `[source, mint, destination, authority, ..extras]` and its
/// data is `[12, amount(u64 LE), decimals(u8)]`. Matching mint + amount + authority + destination
/// binds the record to a real transfer of the right shares, by the right seller, to the recorded
/// buyer. (A hook adds extra trailing accounts but does not change the first four or the data.)
fn transfer_present(
    instructions: &AccountInfo,
    mint: &Pubkey,
    authority: &Pubkey,
    destination: &Pubkey,
    amount: u64,
) -> Result<bool> {
    let token_2022 = Token2022::id();
    for i in 0..MAX_TX_INSTRUCTIONS {
        let ix = match load_instruction_at_checked(i, instructions) {
            Ok(ix) => ix,
            Err(_) => break, // past the last instruction
        };
        if ix.program_id == token_2022
            && ix.data.first() == Some(&SPL_TRANSFER_CHECKED_IX)
            && ix.data.len() >= 9
            && ix.accounts.len() >= 4
            && ix.accounts[1].pubkey == *mint
            && ix.accounts[2].pubkey == *destination
            && ix.accounts[3].pubkey == *authority
        {
            // `ix.data.len() >= 9` is guaranteed above, so this can't fail — but avoid unwrap.
            let Ok(amount_bytes) = <[u8; 8]>::try_from(&ix.data[1..9]) else { continue };
            if u64::from_le_bytes(amount_bytes) == amount {
                return Ok(true);
            }
        }
    }
    Ok(false)
}
