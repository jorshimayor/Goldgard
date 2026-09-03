# Stradebase

A Solana platform for **music royalty ownership** backed by a **GBP-pegged stablecoin (SBTS)**.
Artists list a song as a fixed supply of fractional royalty shares; investors acquire them and
receive a pro-rata cut of streaming royalties. Every share is a Token-2022 asset gated by an
on-chain compliance hook (KYC, sanctions, jurisdiction, caps, lockups).

> **The on-chain programs are a ledger of record, they move no money.** Payment for shares and
> royalty payouts are settled **off-chain by the API**; the programs issue/move the share token
> and record every economic event (amounts stored as data). No stablecoin is transferred
> on-chain and there is no vault.

Alongside the shares, the
platform mints and manages SBTS, accepts and moves USDC/USDT, mints tier NFTs, and exposes all of
it through one backend API and an admin dashboard.

This is a **pnpm monorepo**: on-chain programs, a multi-token SDK, a backend API, typed clients,
and a dashboard in one place.

## What you can do

| Capability                                            | Where                                                    |
| ----------------------------------------------------- | -------------------------------------------------------- |
| Mint & transfer **SBTS** (GBP stablecoin, Token-2022) | API `POST /mint`, `POST /transfer`; dashboard            |
| Accept & transfer **USDC / USDT**                     | API `POST /transfer`, `GET /balances/*`                  |
| **Transaction history** (SBTS/USDC/USDT)              | API `GET /history/:owner` (combined) · `/:owner/:symbol` |
| **Freeze / thaw** tokens (admin)                      | API `POST /admin/freeze` · `/thaw` (SBTS); dashboard     |
| **Mint NFTs** (Metaplex Core) + freeze                | API `POST /nfts/mint` · `/admin/nft/freeze`; dashboard   |
| **Fractional royalty shares** (RWA)                   | `programs/royalty-shares` + `api/onchain` client         |
| **Compliance on every transfer**                      | `programs/transfer-hook`                                 |
| **Admin dashboard**                                   | `sbtBoard/`                                              |

## Repository layout

```
stradebase/
├── programs/
│   ├── royalty-shares/   Anchor program — listings, KYC registry, primary sales, royalties, admin
│   └── transfer-hook/    Token-2022 compliance gate run on every share transfer
├── packages/
│   └── blockchain/       @stradebase/blockchain — SBTS/USDC/USDT SDK (balances, transfers, ATAs, history)
├── api/
│   ├── server/           @stradebase/api — the unified backend (tokens + NFTs + admin)
│   └── onchain/          @stradebase/onchain — typed client for the royalty programs
├── sbtBoard/             Next.js admin dashboard (token, NFT, and royalty admin)
├── assets/nft-metadata/  NFT tier metadata JSON (gold/platinum/silver/diamond/emerald + collections)
├── tests/                Anchor integration + property/fuzz invariant suites
├── migrations/           Anchor deploy hook
├── Anchor.toml · Cargo.toml · pnpm-workspace.yaml
```

## Token model

**SBTS** is the one GBP-pegged Token-2022 stablecoin the platform controls; it is also the token
used to buy royalty shares. USDC/USDT are external USD stablecoins we accept and move but never
mint or freeze.

| Token | Peg | Program    | We mint? | We freeze?                              |
| ----- | --- | ---------- | -------- | --------------------------------------- |
| SBTS  | GBP | Token-2022 | ✅        | ✅ (platform holds the freeze authority) |
| USDC  | USD | SPL Token  | ❌        | ❌                                       |
| USDT  | USD | SPL Token  | ❌        | ❌                                       |

## Prerequisites

- **Node ≥ 18** and **pnpm** (workspace package manager)
- **Rust** + **Solana CLI (Agave 3.x)** + **Anchor 1.1.x** (via `avm`), for the on-chain programs
- A **Solana wallet keypair** at `~/.config/solana/id.json` for local deploys/tests

cargo fix --lib -p royalty\_shares

cargo fix --lib -p royalty\_shares

## Quick start

```bash
# 1. Install the JS/TS workspace (packages/* + api/server + api/onchain)
pnpm install

# 2. On-chain programs
anchor build                       # emits target/idl + target/types (consumed by TS)
anchor test                        # localnet integration + fuzz invariant suites

# 3. Multi-token SDK
pnpm --filter @stradebase/blockchain build
pnpm --filter @stradebase/blockchain test    # 22 unit tests

# 4. Backend API
cp api/server/.env.example api/server/.env    # set SBTS_MINT + ADMIN_SECRET_KEY
pnpm --filter @stradebase/api dev             # http://localhost:8080

# 5. Admin dashboard (separate npm project)
cd sbtBoard && npm install
cp .env.local.example .env.local              # set NEXT_PUBLIC_SBTS_MINT + NEXT_PUBLIC_API_URL
npm run dev                                    # http://localhost:3000
```

## On-chain programs

| Program          | ID                                            | Role                                                                                                                                               |
| ---------------- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `royalty_shares` | `mWG6dhh3iZpTbdjxhc7k8PwqLKkKUFekcWqWRUNXruZ` | listings, KYC/`IdentityRegistry`, usernames, primary `buy_shares` (mint + record), `record_distribution`, admin/compliance                         |
| `transfer_hook`  | `pk9fzHd77xiV5w5mqEsjfa8RKjdye9t9hY8W2VBUpEV` | enforces pause, sanctions, KYC, blocklist, per-wallet + global caps, jurisdiction, accreditation, and lockup on **every** secondary share transfer |

Compliance is enforced twice: inline at the primary sale (`buy_shares`) and again by the transfer
hook on every secondary move. The hook is read-only and trusts only on-chain-resolved accounts.

## Backend API (`@stradebase/api`)

One Express service the team calls. Highlights (full list in
[api/server/README.md](api/server/README.md)):

```
GET  /tokens                       catalogue (mintable/freezable flags)
GET  /balances/:owner              all SBTS/USDC/USDT balances
GET  /history/:owner[/:symbol]     combined or per-token transaction history
POST /mint                         mint SBTS            { to, amount }
POST /transfer                     move any token       { to, symbol, amount, fromSecret? }
POST /admin/freeze | /admin/thaw   freeze/thaw SBTS     { owner, symbol }
POST /distribute/prefund | /distribute   bulk SBTS payout (pre-mint + pooled parallel transfers)
POST /nfts/mint | /nfts/collection mint NFT / collection
POST /admin/nft/freeze | /thaw     freeze/thaw an NFT
GET  /royalties/{config,listings,identity/:u,positions/:m/:o}   royalty reads
POST /royalties/{init,identity,profile,username,listings,buy,transfer,distribute,...}  royalty writes
GET  /royalties/trades/:listing    full on-chain history (primary → secondary)
```

Amounts are decimal strings (`"12.34"`); responses are JSON with bigints rendered as strings.

## Testing

| Suite                    | Command                                       | Covers                                                                                                              |
| ------------------------ | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Anchor integration       | `anchor test`                                 | primary + secondary sales, identity/usernames/PII, and transfer-hook compliance cases                               |
| Property / fuzz          | (part of `anchor test`)                       | supply, conservation, cap, and ledger invariants over random ops                                                    |
| SDK unit                 | `pnpm --filter @stradebase/blockchain test`   | registry, amounts, ATA, tx-parsing (22 tests)                                                                       |
| Backend E2E (tokens/NFT) | `pnpm --filter @stradebase/api e2e`           | real validator: SBTS/USDC/USDT mint→transfer→freeze→history + NFT mint→freeze                                       |
| Backend E2E (royalties)  | `pnpm --filter @stradebase/api royalties-e2e` | deployed programs: init→register→profile→listing→buy→distribute (+ username & PII commitment) over the HTTP service |
| Burst / load             | `pnpm --filter @stradebase/api burst`         | 40 concurrent mints land + idempotency dedupe (fee-payer pool, backpressure)                                        |

The E2E needs a local validator; for the NFT step, clone the Metaplex Core program:

```bash
solana-test-validator --reset \
  --clone-upgradeable-program CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d \
  --url https://api.devnet.solana.com
```

## Security

The transfer hook cannot be fed spoofed compliance accounts, `initialize_global` is gated to the
program's upgrade authority, and trade records are bound to real transfers. Personal data never
goes on-chain (salted hash only). The top pre-launch task is **key custody** (the platform is
custodial).&#x20;

<br />

## Production hardening (before mainnet)

- Harden **custody** (HSM/KMS or MPC/TSS, key separation, signing audit log) — the top risk now that
  no money moves on-chain — and enforce concentration caps at the KYC/entity layer (AUDIT F2).
- Upload `assets/nft-metadata` to permanent storage (Arweave/IPFS) and wire tier → URI.
- Put authn/z + rate limiting in front of the API; move custodial keys to a multisig/HSM.
- Independent third-party audit + coverage-guided fuzzing on Linux CI.

