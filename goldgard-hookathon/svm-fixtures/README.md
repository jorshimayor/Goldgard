# SVM fixtures — a real Anchor program to test the automation pipeline against

`stradebase/` is a fork of the StradeBase client project, trimmed to the parts
that emit **Anchor events**. It exists so the Solana half of the automation
pipeline can be driven end to end on a local validator, without waiting on
mainnet activity or spending provider credit.

## Why a fork rather than pointing at mainnet

The on-chain trigger presets gained Solana arms in onchain-backend#461 —
Jupiter, Marinade, Tensor and SPL Token. Those are all *mainnet* programs: to
see one fire you have to wait for a stranger to swap, stake or list, and every
event costs a wallet re-enrichment (~$0.000432). That is a slow, paid, and
non-deterministic way to find out whether a parser works.

StradeBase gives us a program **we control** that emits real Anchor events with
real 8-byte discriminators. The parser cannot tell the difference, which is the
point.

## What the pipeline actually needs from it

`programs/royalty-shares` declares 16 `#[event]` types and emits them with
`emit!` on every state change:

```
ListingCreated        SharesPurchased        SecondaryTradeRecorded
RoyaltyDistributed    IdentityRegistered     UserProfileCreated
UsernameClaimed       ListingStatusChanged   PlatformFeeUpdated   …
```

Each becomes a `Program data:` line whose first 8 bytes are
`sha256("event:<Name>")[0..8]`. That discriminator is what the backend's
`solana-log-parser` maps onto the same `(chain, address, topic0)` watch key EVM
uses — so an automation watching `SharesPurchased` exercises exactly the code
path a Tensor `nft_sold` would, with none of the waiting.

`transfer-hook` emits no events; it is useful for the other path — the
`SOLANA_ANY_EVENT` sentinel, which lets an automation watch "any activity on
this program" for programs that only ever call `msg!`.

## What was deliberately NOT copied

- **Keypairs** — `admin.json`, `artist.json`, `buyer.json`, `buyer2.json`,
  `recipient.json` are Solana private keys. Generate your own with
  `solana-keygen new` for local runs.
- **`.env`** — the upstream file is git-tracked and carries a comment saying so.
  `.env.example` is here; fill it locally.
- **`sbtBoard/`** — a UI, irrelevant to pipeline testing, and 213 MB of it.

If you re-sync from upstream, keep those exclusions. A keypair committed to this
repo is the same class of problem as the `sk_live_` key still sitting in
`frontend/.env`.

## Running it

```bash
cd svm-fixtures/stradebase
pnpm install
anchor build
anchor test            # spins a local validator, deploys, emits events
```

Then point a local backend's Solana log subscriber at the validator and watch an
automation enrol. The program ids are in `Anchor.toml` under
`[programs.localnet]`.
