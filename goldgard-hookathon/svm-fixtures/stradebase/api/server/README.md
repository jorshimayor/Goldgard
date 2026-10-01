# @stradebase/api — unified backend

One Express service the backend team calls for **tokens, NFTs, and royalty shares**. It's a thin,
typed HTTP layer over [`@stradebase/blockchain`](../../packages/blockchain) (balances / transfers /
history), [`@stradebase/onchain`](../onchain) (the royalty programs), custodial mint + admin
freeze/thaw, and Metaplex Core NFT minting.

> **Full endpoint reference:** [`../../docs/api.md`](../../docs/api.md) ·
> **runnable requests:** [`../../docs/api.http`](../../docs/api.http)

## Tokens

| Symbol | Peg | Program | Mint | Freeze |
|--------|-----|---------|------|--------|
| **SBTS** | GBP | Token-2022 | platform-controlled | ✅ platform is freeze authority |
| USDC | USD | SPL Token | external (Circle) | ❌ external |
| USDT | USD | SPL Token | external (Tether) | ❌ external |

SBTS is the one mint we control, so it's the only token we can **mint** or **freeze**; USDC/USDT
can be **accepted and transferred** but never minted or frozen by us.

## Endpoints

| Method | Path | Body / query | Notes |
|--------|------|--------------|-------|
| GET  | `/health` | — | liveness |
| GET  | `/tokens` | — | catalogue incl. `mintable` / `freezable` flags |
| GET  | `/balances/:owner` | — | all three balances (missing ATA = zero) |
| GET  | `/balances/:owner/:symbol` | — | one balance |
| GET  | `/history/:owner` | `?limit` | combined SBTS+USDC+USDT history, newest first |
| GET  | `/history/:owner/:symbol` | `?limit&before` | one token's paginated transfer history |
| POST | `/mint` | `{ to, amount }` | mint SBTS to a wallet |
| POST | `/transfer` | `{ to, symbol, amount, fromSecret? }` | omit `fromSecret` to send from the treasury |
| POST | `/admin/freeze` | `{ owner, symbol }` | SBTS only |
| POST | `/admin/thaw` | `{ owner, symbol }` | SBTS only |
| POST | `/nfts/collection` | `{ name, uri }` | create a Metaplex Core collection |
| POST | `/nfts/mint` | `{ name, uri, owner?, collection? }` | mint a Core NFT (freezable by the platform) |
| GET  | `/nfts/:asset` | — | read owner / uri / frozen |
| POST | `/admin/nft/freeze` | `{ asset, collection? }` | freeze an NFT |
| POST | `/admin/nft/thaw` | `{ asset, collection? }` | thaw an NFT |

NFTs are **Metaplex Core** assets. Minting is custodial: the platform admin is the update +
FreezeDelegate authority, so it can freeze any asset it issued. `uri` must be a hosted metadata
JSON URL — upload the tier files under `assets/nft-metadata` (gold/platinum/silver/…) to
Arweave/IPFS/CDN and pass the resulting URL.

Amounts are human-readable decimal strings (`"12.34"`); the service converts to base units
bigint-safely. All responses are JSON with bigints rendered as strings.

## Run

```bash
pnpm install                       # from the repo root (workspace)
cp api/server/.env.example api/server/.env   # fill in SBTS_MINT + ADMIN_SECRET_KEY
pnpm --filter @stradebase/api dev  # tsx watch
# or: pnpm --filter @stradebase/api build && pnpm --filter @stradebase/api start
```

## End-to-end test

`test/e2e.ts` drives the real service layer against a local validator: it creates a real SBTS
Token-2022 mint + USDC/USDT test mints and exercises mint → transfer → freeze/thaw → history for
all three tokens (asserting USDC/USDT freeze is rejected), the combined history, and NFT
mint → freeze → thaw.

```bash
# terminal 1 — validator with the Metaplex Core program cloned (for the NFT step)
solana-test-validator --reset \
  --clone-upgradeable-program CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d \
  --url https://api.devnet.solana.com

# terminal 2
pnpm --filter @stradebase/api e2e
```

(The token flows pass on a plain validator; only the NFT step needs the cloned Core program.)

## Security notes

- `ADMIN_SECRET_KEY` is a hot custodial key (SBTS mint + freeze authority, fee payer). Keep it
  in a secret manager; use a multisig-controlled authority in production.
- `POST /transfer` accepts an optional `fromSecret` for signing on a user's behalf — only for
  fully custodial flows. For non-custodial flows, build the transaction and have the user's
  wallet sign it instead (use `buildTransferTransaction` from `@stradebase/blockchain`).
- Put authn/z (API keys, rate limiting) in front of `/mint`, `/transfer`, and `/admin/*`.
