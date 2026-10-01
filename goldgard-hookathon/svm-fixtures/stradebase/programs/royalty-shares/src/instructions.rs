//! Instruction handlers. Each module holds its `Accounts` struct (account validation),
//! any params struct, and a `handler` fn; `lib.rs` wires them into the `#[program]` module.
//! The glob re-exports below let `lib.rs` refer to `Context<BuyShares>`, `BuySharesParams`,
//! etc. without long paths.

pub mod admin;
pub mod buy_shares;
pub mod create_listing;
pub mod initialize_global;
pub mod record_distribution;
pub mod record_secondary_trade;
pub mod register_identity;
pub mod user_profile;
pub mod username;

pub use admin::*;
pub use buy_shares::*;
pub use create_listing::*;
pub use initialize_global::*;
pub use record_distribution::*;
pub use record_secondary_trade::*;
pub use register_identity::*;
pub use user_profile::*;
pub use username::*;
