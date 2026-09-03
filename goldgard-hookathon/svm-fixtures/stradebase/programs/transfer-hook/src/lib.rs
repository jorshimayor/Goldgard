//! # transfer_hook — Token-2022 compliance gate for royalty shares
//!
//! The share mint carries a Transfer Hook extension pointing here, so Token-2022 CPIs into
//! [`transfer_hook::transfer_hook`] on **every** share transfer (before it finalizes). We
//! atomically enforce, on the recipient unless noted:
//!   * global pause (circuit breaker)
//!   * sanctions — on both sender and recipient
//!   * KYC ≥ 1
//!   * per-listing blocklist — sender and recipient
//!   * per-wallet ownership cap, and the global-bps concentration cap
//!   * jurisdiction allow-list and accreditation
//!   * lockup — on the *sender's* position (primary buyers only; see below)
//!
//! ## Why the accounts we read are trustworthy (the key security property)
//! This hook is **read-only** — it mutates nothing and moves no funds — so a direct call
//! with spoofed accounts can only make it return Ok/Err, which is harmless. During a real
//! transfer, Token-2022 does **not** trust client-supplied extra accounts: it re-resolves
//! them **on-chain** from the mint's [`ExtraAccountMetaList`] and passes exactly those. So
//! the seven extras below are guaranteed to be the correct PDAs. As defense in depth,
//! [`load`] additionally checks each is owned by `royalty_shares` (+ Anchor discriminator),
//! and the handler binds `ComplianceConfig`/`SongListing` back to the mint being moved. A
//! foreign mint pointed at this hook simply fails to resolve our PDAs → the transfer reverts.
//!
//! ## How resolution works
//! The compliance PDAs aren't passed by the user — they're *derived* by the resolver from
//! the transfer's own accounts: identities from the token-account owner bytes
//! (`Seed::AccountData`), the position from `(mint, sender)`, and the listing from the
//! pubkey stored inside `ComplianceConfig` (`PubkeyData::AccountData`). See
//! [`initialize_extra_account_meta_list`], which must run once per mint.
//!
//! ## Dispatch
//! Token-2022 invokes the SPL "Execute" instruction (its own discriminator), not an Anchor
//! one, so [`transfer_hook::fallback`] translates it to the Anchor `transfer_hook` handler.

use anchor_lang::prelude::*;
use anchor_lang::solana_program::program_error::ProgramError;
use spl_tlv_account_resolution::{
    account::ExtraAccountMeta, pubkey_data::PubkeyData, seeds::Seed, state::ExtraAccountMetaList,
};
use spl_transfer_hook_interface::instruction::{ExecuteInstruction, TransferHookInstruction};

use anchor_spl::token_interface::{Mint, TokenAccount};

use royalty_shares::constants::BPS_DENOMINATOR;
use royalty_shares::state::{
    ComplianceConfig, GlobalConfig, HolderPosition, IdentityRegistry, SongListing,
};

declare_id!("pk9fzHd77xiV5w5mqEsjfa8RKjdye9t9hY8W2VBUpEV");

/// Extras appended after the 5 standard hook accounts (source, mint, destination, owner,
/// meta-list). Must equal the number of metas written in
/// [`initialize_extra_account_meta_list`] AND the extra fields on [`ExecuteTransferHook`],
/// in the same order: program, global_config, compliance_config, source_identity,
/// destination_identity, source_position, listing.
const NUM_EXTRA_METAS: usize = 7;

/// Byte offset of `ComplianceConfig.listing` within its account data: the 8-byte Anchor
/// discriminator, then `listing: Pubkey` is the first field. The resolver reads the listing
/// address straight from here via `PubkeyData::AccountData`, so this must track the struct.
const COMPLIANCE_LISTING_OFFSET: u8 = 8;

#[error_code]
pub enum HookError {
    #[msg("Platform is globally paused")]
    GlobalPaused,
    #[msg("Account is on this listing's blocked list")]
    Sanctioned,
    /// Deliberately vague: the transactional standing is on-chain, the reason is not.
    #[msg("Account is restricted or frozen by compliance")]
    ComplianceBlocked,
    #[msg("Recipient has not completed the required KYC")]
    KycRequired,
    #[msg("Transfer would exceed the per-wallet ownership cap")]
    ExceedsWalletCap,
    #[msg("Mandatory lockup period is still active")]
    LockupActive,
    #[msg("Transfer would exceed the global ownership cap")]
    ExceedsGlobalCap,
    #[msg("Recipient must be an accredited investor for this listing")]
    AccreditationRequired,
    #[msg("Recipient's jurisdiction is not permitted for this listing")]
    JurisdictionNotAllowed,
    #[msg("Arithmetic overflow")]
    MathOverflow,
    #[msg("A required compliance account is missing or not owned by the royalty program")]
    InvalidComplianceAccount,
}

#[program]
pub mod transfer_hook {
    use super::*;

    /// Create the ExtraAccountMetaList PDA that tells Token-2022 which extra
    /// accounts to pass into `Execute`. Call once per share mint.
    pub fn initialize_extra_account_meta_list(
        ctx: Context<InitializeExtraAccountMetaList>,
    ) -> Result<()> {
        // Order here MUST match the extra-account order in `ExecuteTransferHook`.
        // Full accounts list indices: 0=source,1=mint,2=destination,3=owner,
        // 4=extra_meta_list, 5=royalty_shares program, 6.. = resolved PDAs below.
        let metas = vec![
            // 5: the royalty_shares program (deriving program for the PDAs)
            ExtraAccountMeta::new_with_pubkey(&royalty_shares::ID, false, false)?,
            // 6: GlobalConfig — seeds [b"global_config"]
            ExtraAccountMeta::new_external_pda_with_seeds(
                5,
                &[Seed::Literal { bytes: b"global_config".to_vec() }],
                false,
                false,
            )?,
            // 7: ComplianceConfig — seeds [b"compliance", mint]
            ExtraAccountMeta::new_external_pda_with_seeds(
                5,
                &[
                    Seed::Literal { bytes: b"compliance".to_vec() },
                    Seed::AccountKey { index: 1 },
                ],
                false,
                false,
            )?,
            // 8: source IdentityRegistry — seeds [b"identity", source_owner]
            ExtraAccountMeta::new_external_pda_with_seeds(
                5,
                &[
                    Seed::Literal { bytes: b"identity".to_vec() },
                    Seed::AccountData { account_index: 0, data_index: 32, length: 32 },
                ],
                false,
                false,
            )?,
            // 9: destination IdentityRegistry — seeds [b"identity", dest_owner]
            ExtraAccountMeta::new_external_pda_with_seeds(
                5,
                &[
                    Seed::Literal { bytes: b"identity".to_vec() },
                    Seed::AccountData { account_index: 2, data_index: 32, length: 32 },
                ],
                false,
                false,
            )?,
            // 10: source HolderPosition — seeds [b"position", mint, source_owner]
            ExtraAccountMeta::new_external_pda_with_seeds(
                5,
                &[
                    Seed::Literal { bytes: b"position".to_vec() },
                    Seed::AccountKey { index: 1 },
                    Seed::AccountData { account_index: 0, data_index: 32, length: 32 },
                ],
                false,
                false,
            )?,
            // 11: SongListing — address read straight from ComplianceConfig.listing
            // (account index 7 in the full list, field at offset 8). This gives the
            // hook total_shares / jurisdictions / accreditation for secondary transfers.
            ExtraAccountMeta::new_with_pubkey_data(
                &PubkeyData::AccountData { account_index: 7, data_index: COMPLIANCE_LISTING_OFFSET },
                false,
                false,
            )?,
        ];

        let mut data = ctx.accounts.extra_account_meta_list.try_borrow_mut_data()?;
        ExtraAccountMetaList::init::<ExecuteInstruction>(&mut data, &metas)?;
        Ok(())
    }

    /// The compliance gate. Invoked by Token-2022 during every share transfer.
    pub fn transfer_hook(ctx: Context<ExecuteTransferHook>, amount: u64) -> Result<()> {
        let a = &ctx.accounts;

        let global = load::<GlobalConfig>(&a.global_config)?;
        require!(!global.is_paused, HookError::GlobalPaused);

        let source_owner = a.source_token.owner;
        let dest_owner = a.destination_token.owner;

        // Sender & recipient compliance standing + recipient KYC. The two sides are gated
        // asymmetrically on purpose: a `Restricted` wallet (under review) may still
        // receive, so an open review doesn't strand a counterparty mid-settlement, but it
        // may not send.
        let source_id = load::<IdentityRegistry>(&a.source_identity)?;
        require!(source_id.status.can_send(), HookError::ComplianceBlocked);

        let dest_id = load::<IdentityRegistry>(&a.destination_identity)?;
        require!(dest_id.status.can_receive(), HookError::ComplianceBlocked);
        require!(dest_id.kyc_level >= 1, HookError::KycRequired);

        // Per-listing blocked list + per-wallet cap.
        let cc = load::<ComplianceConfig>(&a.compliance_config)?;
        // Defense-in-depth: bind the resolved compliance account to the mint being moved.
        require_keys_eq!(cc.share_mint, a.mint.key(), HookError::InvalidComplianceAccount);
        require!(!cc.is_blocked(&source_owner), HookError::Sanctioned);
        require!(!cc.is_blocked(&dest_owner), HookError::Sanctioned);

        // Token-2022 invokes the hook AFTER crediting the destination, so
        // `destination_token.amount` is already the post-transfer balance —
        // adding `amount` again would double-count and enforce ~half the cap.
        let new_balance = a.destination_token.amount;
        let _ = amount; // already reflected in `new_balance`
        if cc.max_shares_per_wallet > 0 {
            require!(
                new_balance <= cc.max_shares_per_wallet,
                HookError::ExceedsWalletCap
            );
        }

        // Listing-level rules (global cap, jurisdiction, accreditation) on the recipient.
        let listing = load::<SongListing>(&a.listing)?;
        require_keys_eq!(listing.share_mint, a.mint.key(), HookError::InvalidComplianceAccount);
        let global_cap = (listing.total_shares as u128)
            .checked_mul(global.max_global_ownership_bps as u128)
            .ok_or(HookError::MathOverflow)?
            / BPS_DENOMINATOR as u128;
        if global_cap > 0 {
            require!(new_balance as u128 <= global_cap, HookError::ExceedsGlobalCap);
        }
        if listing.requires_accredited {
            require!(dest_id.accredited, HookError::AccreditationRequired);
        }
        if !listing.allowed_jurisdictions.is_empty() {
            require!(
                listing
                    .allowed_jurisdictions
                    .iter()
                    .any(|j| *j == dest_id.jurisdiction),
                HookError::JurisdictionNotAllowed
            );
        }

        // Lockup on the sender's position. Positions are created only on primary
        // buys, so a secondary holder sending shares onward has none — treat a
        // missing position as "no lockup" rather than reverting, otherwise shares
        // become non-transferable after the first hop.
        if let Some(pos) = load_optional::<HolderPosition>(&a.source_position)? {
            let now = Clock::get()?.unix_timestamp;
            require!(now >= pos.unlock_time, HookError::LockupActive);
        }

        Ok(())
    }

    /// SPL Transfer-Hook interface dispatch. Token-2022 calls `Execute` with the
    /// interface discriminator (not an Anchor one), so we translate it here.
    pub fn fallback<'info>(
        program_id: &'info Pubkey,
        accounts: &'info [AccountInfo<'info>],
        data: &'info [u8],
    ) -> Result<()> {
        let ix = TransferHookInstruction::unpack(data)?;
        match ix {
            TransferHookInstruction::Execute { .. } => {
                // SPL Execute data layout: [8-byte discriminator][8-byte amount LE].
                // Anchor's dispatcher wants the args (amount) with the 'info lifetime,
                // so forward the tail of the original `data` slice rather than a local.
                __private::__global::transfer_hook(program_id, accounts, &data[8..])
            }
            _ => Err(ProgramError::InvalidInstructionData.into()),
        }
    }
}

/// Deserialize a `royalty_shares`-owned account, verifying program ownership first.
fn load<T: AccountDeserialize>(info: &AccountInfo) -> Result<T> {
    require_keys_eq!(
        *info.owner,
        royalty_shares::ID,
        HookError::InvalidComplianceAccount
    );
    let data = info.try_borrow_data()?;
    let mut slice: &[u8] = &data;
    T::try_deserialize(&mut slice).map_err(|_| HookError::InvalidComplianceAccount.into())
}

/// Like `load`, but returns `None` for an account that is not owned by
/// `royalty_shares` (i.e. never created), instead of erroring.
fn load_optional<T: AccountDeserialize>(info: &AccountInfo) -> Result<Option<T>> {
    if info.owner != &royalty_shares::ID || info.data_is_empty() {
        return Ok(None);
    }
    let data = info.try_borrow_data()?;
    let mut slice: &[u8] = &data;
    Ok(Some(
        T::try_deserialize(&mut slice).map_err(|_| HookError::InvalidComplianceAccount)?,
    ))
}

#[derive(Accounts)]
pub struct InitializeExtraAccountMetaList<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    /// CHECK: PDA that stores the resolver metadata; created here.
    #[account(
        init,
        payer = payer,
        space = ExtraAccountMetaList::size_of(NUM_EXTRA_METAS).unwrap(),
        seeds = [b"extra-account-metas", mint.key().as_ref()],
        bump
    )]
    pub extra_account_meta_list: UncheckedAccount<'info>,

    pub mint: InterfaceAccount<'info, Mint>,
    pub system_program: Program<'info, System>,
}

/// Account order MUST match the resolver: the 5 standard accounts, then the 7
/// extras in the same order they were written to the ExtraAccountMetaList.
#[derive(Accounts)]
pub struct ExecuteTransferHook<'info> {
    #[account(token::mint = mint)]
    pub source_token: InterfaceAccount<'info, TokenAccount>,
    pub mint: InterfaceAccount<'info, Mint>,
    #[account(token::mint = mint)]
    pub destination_token: InterfaceAccount<'info, TokenAccount>,
    /// CHECK: source authority (validated by the token program).
    pub owner: UncheckedAccount<'info>,
    /// CHECK: ExtraAccountMetaList PDA.
    #[account(seeds = [b"extra-account-metas", mint.key().as_ref()], bump)]
    pub extra_account_meta_list: UncheckedAccount<'info>,

    // ----- Resolved extras (indices 5..=10) -----
    /// CHECK: royalty_shares program id (deriving program for the PDAs below).
    #[account(address = royalty_shares::ID)]
    pub royalty_shares_program: UncheckedAccount<'info>,
    /// CHECK: deserialized + ownership-checked in the handler.
    pub global_config: UncheckedAccount<'info>,
    /// CHECK: deserialized + ownership-checked in the handler.
    pub compliance_config: UncheckedAccount<'info>,
    /// CHECK: deserialized + ownership-checked in the handler.
    pub source_identity: UncheckedAccount<'info>,
    /// CHECK: deserialized + ownership-checked in the handler.
    pub destination_identity: UncheckedAccount<'info>,
    /// CHECK: deserialized + ownership-checked in the handler.
    pub source_position: UncheckedAccount<'info>,
    /// CHECK: SongListing; address resolved from ComplianceConfig.listing,
    /// deserialized + ownership-checked in the handler.
    pub listing: UncheckedAccount<'info>,
}
