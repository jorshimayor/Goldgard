//! Custom program errors. Anchor assigns each a code starting at 6000 and surfaces the
//! `#[msg]` text in logs and client SDKs — write them for the person debugging a failed tx.

use anchor_lang::prelude::*;

#[error_code]
pub enum RoyaltyError {
    #[msg("Platform is globally paused")]
    GlobalPaused,
    #[msg("Listing is not active")]
    ListingNotActive,
    #[msg("Listing sale window has not opened yet")]
    SaleNotStarted,
    #[msg("Listing sale window has closed")]
    SaleEnded,
    #[msg("Not enough shares remaining in the listing")]
    InsufficientShares,
    #[msg("Fee basis points exceed 100%")]
    InvalidFeeBps,
    #[msg("Royalty split percentages are invalid")]
    InvalidRoyaltySplit,
    #[msg("Amount must be greater than zero")]
    ZeroAmount,
    #[msg("Arithmetic overflow")]
    MathOverflow,
    #[msg("Signer is not authorized for this action")]
    Unauthorized,
    #[msg("Buyer has not completed KYC to the required level")]
    KycRequired,
    #[msg("Buyer must be an accredited investor for this listing")]
    AccreditationRequired,
    #[msg("Account is sanctioned / blocked")]
    Sanctioned,
    #[msg("Buyer's jurisdiction is not permitted for this listing")]
    JurisdictionNotAllowed,
    #[msg("Purchase would exceed the per-wallet ownership cap")]
    ExceedsWalletCap,
    #[msg("Purchase would exceed the global ownership cap")]
    ExceedsGlobalCap,
    #[msg("Mandatory lockup period is still active")]
    LockupActive,
    #[msg("Metadata URI exceeds the maximum length")]
    MetadataUriTooLong,
    #[msg("Too many allowed jurisdictions supplied")]
    TooManyJurisdictions,
    #[msg("Blocked-user list is full")]
    BlockedListFull,
    #[msg("Provided transfer-hook program does not match the configured program id")]
    InvalidTransferHookProgram,
    #[msg("Nothing available to claim")]
    NothingToClaim,
    #[msg("Lockup period is too large")]
    InvalidLockup,
    #[msg("This role cannot create listings (requires Artist or Both)")]
    RoleCannotCreateListing,
    #[msg("Resale offer is not active")]
    OfferNotActive,
    #[msg("Resale offer has expired")]
    OfferExpired,
    #[msg("Resale offer does not have that many shares remaining")]
    InsufficientOfferShares,
    #[msg("Sale price is below the minimum sale value for this listing")]
    BelowMinimumSaleValue,
    #[msg("Seller does not hold enough shares")]
    InsufficientBalance,
    #[msg("Buyer and seller must be different accounts")]
    SelfTrade,
    #[msg("Distributor is not authorized for this listing")]
    DistributorNotAuthorized,
    #[msg("Distributor name exceeds the maximum length")]
    DistributorNameTooLong,
    #[msg("Listing's lease term has not expired yet")]
    LeaseNotExpired,
    #[msg("Listing's lease term has expired")]
    LeaseExpired,
    #[msg("Listing has been terminated")]
    ListingTerminated,
    #[msg("This listing type does not support that operation")]
    InvalidListingType,
    #[msg("Share transfers must be mediated by the royalty-shares program")]
    UnmediatedTransfer,
    #[msg("Auction parameters are invalid")]
    InvalidAuctionParams,
    #[msg("Lease duration is invalid")]
    InvalidLeaseDuration,
    #[msg("Username must be between 3 and 32 characters")]
    UsernameLength,
    #[msg("Username may only contain lowercase letters, digits and underscores")]
    UsernameInvalidCharacter,
    #[msg("This profile already has a username; release it before claiming another")]
    UsernameAlreadyClaimed,
    #[msg("Username does not match the record being released")]
    UsernameMismatch,
    #[msg("Unknown PII commitment scheme")]
    InvalidCommitmentScheme,
    #[msg("Account is restricted or frozen by compliance")]
    ComplianceBlocked,
    #[msg("No matching share transfer found in this transaction to back the trade record")]
    TransferNotFound,
}
