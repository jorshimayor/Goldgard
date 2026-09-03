# Devnet runbook — deploy, configure, and test every endpoint

A copy-paste guide to get the whole platform running on **devnet** and exercise every endpoint end
to end. Pair it with [api.http](api.http) (runnable requests) and [api.md](api.md) (reference).

**What you'll have at the end:** both programs deployed to devnet, an SBTS Token-2022 mint + test
USDC/USDT you control, the API running against devnet, `GlobalConfig` initialized, and a full
primary→secondary→distribution flow exercised — optionally in custody mode.

***

## 0. Prerequisites

- Solana CLI (Agave 3.x), Anchor 1.1.2 (avm), pnpm, Node 18+.
- `pnpm install` at the repo root (once).
- The program keypairs in `target/deploy/` (present after `anchor build`). Confirm the IDs match
  what's committed: `anchor keys list` should print
  `royalty_shares: mWG6dhh3iZpTbdjxhc7k8PwqLKkKUFekcWqWRUNXruZ` and
  `transfer_hook: pk9fzHd77xiV5w5mqEsjfa8RKjdye9t9hY8W2VBUpEV`.

> Tip: use a **paid devnet RPC** (Alchemy/Helius/Triton) for anything beyond a few calls — the
> public `api.devnet.solana.com` will rate-limit. Your Alchemy devnet URL works everywhere below
> (set it as `SOLANA_RPC_URL` and pass `--url` to the CLI).

## Documentation

Start with **[docs/README.md](docs/README.md)** — the docs index. Key entries:

- [docs/architecture.md](docs/architecture.md) — the whole system: model, layout, programs, backend
- [docs/devnet.md](docs/devnet.md) — **deploy + test every endpoint on devnet**, end to end
- [docs/api.md](docs/api.md) · [docs/api.http](docs/api.http) — endpoint reference + runnable requests
- [docs/backend-handover.md](docs/backend-handover.md) — for the backend dev: what to build on the master codebase
- [docs/security.md](docs/security.md) — security, compliance, privacy, custody
- Per-package: [api/server](api/server/README.md) · [packages/blockchain](packages/blockchain/README.md) · [api/onchain](api/onchain/README.md) · [sbtBoard](sbtBoard/README.md)

## Roles you'll use below

Three distinct identities run through this guide. Keep their keys separate.

| Role | Key file (devnet) | What it is | Used for |
|---|---|---|---|
| **deployer** | `~/.config/solana/id.json` | pays for the deploy → becomes the **upgrade authority**; the `init` signer becomes the **ops authority** | steps 1–2 (deploy), step 6 (`init`), and the ops writes: `distribute`, `admin/listing-status`, `admin/pause`, `admin/fee` |
| **admin** | `admin.json` (its secret key → `ADMIN_SECRET_KEY`) | the platform **custodial key**: SBTS **mint + freeze** authority, the **compliance authority**, and the **treasury** | step 3 (create mints), and all compliance writes: `identity`, `pii`, `admin/block`\|`unblock`\|`compliance`, `hook-metas`, plus token mint/freeze |
| **users** (owner / artist / buyer / …) | one keypair each | ordinary end-user wallets (custodial in production) | their own actions: `profile`, `username`, `listings` (artist), `buy` (buyer), secondary `transfer` (seller) |

Two rules this creates, which the steps below follow:
- **`init` is signed by the deployer**, and it sets `complianceAuthority` and `treasury` to the
  **admin** pubkey — so the same key (`admin.json` / `ADMIN_SECRET_KEY`) that signs later compliance
  calls is the one the program checks (`has_one = compliance_authority`).
- The **ops authority is whoever signed `init`** (the deployer), so the ops writes above are signed
  by the deployer's key, not the admin's.

In `api.http` these are the `@deployerSecret`, `@admin`/`@adminSecret`, and per-user `…Secret`
variables. See [api.md](api.md) → **Roles** for the endpoint-by-endpoint mapping.

## 1. Point the CLI at devnet and fund the deployer

The **deployer** wallet pays for the deploy and becomes the programs' **upgrade authority** (and the
only key allowed to call `POST /royalties/init`).

```bash
solana config set --url https://api.devnet.solana.com          # or your Alchemy devnet URL
solana config set --keypair ~/.config/solana/id.json           # your deployer wallet
solana airdrop 5                                                # repeat if throttled; programs need ~4 SOL
solana address                                                  # note this = upgrade authority
```

## 2. Deploy both programs to devnet

`anchor build` first, then deploy. **Deploy each program with the Solana CLI directly** — it skips
Anchor's on-chain IDL/metadata step, which on the current Anchor CLI can fail on devnet and, worse,
**abort the whole `anchor program deploy` before the second program is deployed** (a failed IDL
upload on `royalty_shares` leaves `transfer_hook` undeployed). The plain CLI can't hit that.

```bash
anchor build

solana program deploy target/deploy/royalty_shares.so \
  --program-id target/deploy/royalty_shares-keypair.json
solana program deploy target/deploy/transfer_hook.so \
  --program-id target/deploy/transfer_hook-keypair.json
```

The IDs are fixed by `declare_id!` + `Anchor.toml [programs.devnet]`, so they're the same as local
(`anchor keys list` should print `mWG6…NXruZ` and `pk9f…UpEV`). Verify **both** are live:

```bash
solana program show mWG6dhh3iZpTbdjxhc7k8PwqLKkKUFekcWqWRUNXruZ   # royalty_shares
solana program show pk9fzHd77xiV5w5mqEsjfa8RKjdye9t9hY8W2VBUpEV   # transfer_hook
```

> **On-chain IDL is optional and separate.** The backend ships the IDL in `api/onchain/` and doesn't
> read it from chain, so you don't need it to run. To add it (nice for explorer decoding), do it
> **after** both programs are deployed, on a paid RPC with a few SOL to spare — the multi-tx upload
> is what fails on public devnet:
>
> ```bash
> anchor idl init mWG6dhh3iZpTbdjxhc7k8PwqLKkKUFekcWqWRUNXruZ -f target/idl/royalty_shares.json --provider.cluster <alchemy-devnet-url>
> anchor idl init pk9fzHd77xiV5w5mqEsjfa8RKjdye9t9hY8W2VBUpEV -f target/idl/transfer_hook.json  --provider.cluster <alchemy-devnet-url>
> # already partially written?  anchor idl upgrade …   (run `anchor idl --help` to confirm flags)
> ```
> If it still fails, skip it — it's cosmetic.

## 3. Create the token mints (on devnet, ones you control)

You need an **SBTS** Token-2022 mint you're the mint+freeze authority of, plus **test USDC/USDT** so
you can fund wallets. Use a dedicated **admin** keypair for these (this becomes `ADMIN_SECRET_KEY`).

```bash
solana-keygen new -o admin.json --no-bip39-passphrase          # the custodial admin key
solana airdrop 2 $(solana address -k admin.json) --url devnet

# SBTS — GBP-pegged, Token-2022, 9 decimals, admin = mint AND freeze authority
spl-token create-token --program-2022 --decimals 9 --enable-freeze \
  --mint-authority admin.json --fee-payer admin.json           # → prints the SBTS mint address

# Test USDC + USDT (classic SPL, 6 decimals) so you can mint yourself balances on devnet
spl-token create-token --decimals 6 --fee-payer admin.json     # → USDC test mint
spl-token create-token --decimals 6 --fee-payer admin.json     # → USDT test mint
```

Record the three mint addresses. (On mainnet you'd use the real USDC/USDT mints and *not* mint them.)

## 4. Configure `api/server/.env`

```bash
cp api/server/.env.example api/server/.env
```

Set at least:

```ini
SOLANA_RPC_URL=https://api.devnet.solana.com      # or your Alchemy devnet URL
CLUSTER=devnet
SBTS_MINT=<SBTS mint from step 3>
SBTS_DECIMALS=9
USDC_MINT=<USDC test mint from step 3>
USDT_MINT=<USDT test mint from step 3>
ADMIN_SECRET_KEY=<contents of admin.json, e.g. [12,34,...]>   # the SBTS mint+freeze authority
```

`ADMIN_SECRET_KEY` must be the **same key** you made the SBTS mint/freeze authority in step 3, or
minting/freezing will fail with an authority error.

## 5. Start the API

```bash
pnpm --filter @stradebase/api dev            # http://localhost:8080
curl localhost:8080/health                    # { ok, engine, ... }
```

Optional extras (see their sections below): the custody **signer** (`pnpm --filter @stradebase/api
signer`) and the **indexer** worker (`pnpm --filter @stradebase/api indexer`).

## 6. Initialize the platform (once)

`GlobalConfig` is a singleton, gated to the deployer (upgrade authority). Using [api.http](api.http),
fill `@deployerSecret` with `~/.config/solana/id.json`'s contents and `@adminSecret` with
`admin.json`'s, then send **`POST /royalties/init`**. Or curl:

```bash
curl -sX POST localhost:8080/royalties/init -H 'content-type: application/json' -d '{
  "secret": <deployer secret-key array>,
  "complianceAuthority": "<admin pubkey>",
  "treasury": "<admin pubkey>",
  "platformFeeBps": 200,
  "maxGlobalOwnershipBps": 10000
}'
```

`GET /royalties/config` should now return the config.

## 7. Smoke-test every endpoint (full flow)

Open [api.http](api.http), set `@baseUrl = http://localhost:8080`, fill the wallet vars (generate a
few keypairs with `solana-keygen new -o …` and paste pubkeys + secret arrays), and run top to bottom.
The intended order — which touches every route — is:

1. **Health/discovery:** `GET /health`, `GET /tokens`.
2. **Tokens:** `POST /mint` (SBTS to a wallet) → `GET /balances/:owner` → `GET /balances/:owner/unified`
   → `POST /transfer` (SBTS, and fund+transfer test USDC/USDT) → `GET /history/:owner`.
3. **Admin token controls:** `POST /admin/freeze` then `/admin/thaw` (SBTS only; USDC/USDT rejected).
4. **NFTs** (needs Metaplex Core on devnet, which it is): `POST /nfts/collection` → `POST /nfts/mint`
   → `GET /nfts/:asset` → `POST /admin/nft/freeze` / `/thaw`.
5. **Royalties:** `POST /royalties/init` (done) → `/identity` (KYC + PII commitment) → `/profile` (artist
   - investor) → `/username` → `/listings` (copy `listing` + `shareMint` into the vars) → `/hook-metas`
     → `/buy` (primary) → `/transfer` (secondary sale) → `/distribute` (record a payout).
6. **Royalty reads:** `GET /royalties/config`, `/listings`, `/listings/:listing`, `/identity/:user`,
   `/profile/:user`, `/username/:name`, `/positions/:mint/:owner`, `/distributions/:listing`,
   `/trades/:listing` (full primary→secondary history), `/reconcile/:listing`.
7. **Bulk sale path:** `POST /distribute/prefund` then `POST /distribute`.

Every write accepts `secret` (dev) — or `keyRef` once custody is on (step 8).

## 8. Custody mode on devnet (optional)

To test the production signing path (keys held outside the API):

```bash
pnpm --filter @stradebase/api signer                 # reference custody service on :8090
# add to api/server/.env, then restart the API:
#   SIGNER_URL=http://127.0.0.1:8090
```

Register a wallet's key with the service to get an opaque `keyRef`, then use `keyRef` instead of
`secret` on any write:

```bash
curl -sX POST localhost:8090/keys -H 'content-type: application/json' \
  -d '{ "secret": <wallet secret-key array> }'      # → { keyRef, publicKey }

curl -sX POST localhost:8080/royalties/buy -H 'content-type: application/json' \
  -d '{ "keyRef": "<keyRef>", "listing": "<listing>", "shares": 5, "settlementAmount": 5000000000 }'
```

See [backend-handover.md](backend-handover.md). In production the signer service is replaced by your KMS/MPC provider.

## 9. Indexer / reconciliation on devnet (optional)

`GET /royalties/trades/:listing` reads the on-chain ledger directly and needs nothing extra.
For the reconciliation audit net and read-scaling, run the worker (durable store optional):

```bash
# durable store (recommended on devnet if you want it to survive restarts):
#   pnpm --filter @stradebase/api add pg
#   INDEXER_STORE=postgres  DATABASE_URL=postgres://…   in .env
pnpm --filter @stradebase/api indexer                # background worker
curl localhost:8080/royalties/reconcile/<listing>    # should show unrecorded: []
```

See [architecture.md](architecture.md).

## 10. FX for the unified balance

`GET /balances/:owner/unified` uses `FX_SOURCE=fixed` (`FX_GBP_USD`, default 1.27) out of the box —
fine for testing. To use the live Pyth GBP/USD feed on devnet set `FX_SOURCE=pyth` (verify
`PYTH_GBPUSD_FEED_ID` at pyth.network/price-feeds). See [api.md](api.md) `#unified`.

***

## Gotchas & handover notes

- **Upgrade authority = whoever deployed.** Keep `~/.config/solana/id.json` (the deployer) safe — it
  can upgrade the programs and is the only key that can `init`. For production, move it to a
  timelocked multisig (see [backend-handover.md](backend-handover.md) §key separation).
- **`ADMIN_SECRET_KEY`** **is a hot super-key** (SBTS mint + freeze). Fine for devnet; split + secure it
  before mainnet.
- **Public devnet RPC throttles.** Use a paid devnet endpoint for the burst/indexer paths.
- **`secret`** **in request bodies is a devnet/testing convenience.** For production, use custody mode
  (`keyRef`, step 8) so raw keys never transit HTTP.
- **Programs move no money.** SBTS/USDC/USDT amounts on royalty writes are recorded as data;
  settlement happens off-chain (see [architecture.md](architecture.md)).
- **Re-running** **`init`** **fails** ("already in use") — the singleton exists; that's expected.

## One-shot local sanity (before devnet)

Everything above also runs against a local validator, which the automated suites use:

```bash
anchor test                                   # 30 on-chain tests
pnpm --filter @stradebase/api unified-test    # FX/decimals math
pnpm --filter @stradebase/api pgstore-test    # Postgres store mapping
# with a local validator + `anchor deploy`:
pnpm --filter @stradebase/api e2e             # tokens/NFT/unified
pnpm --filter @stradebase/api royalties-e2e   # royalty flow (secret mode)
pnpm --filter @stradebase/api signer-e2e      # royalty flow (custody keyRef mode)
pnpm --filter @stradebase/api indexer-test    # secondary record + reconcile
pnpm --filter @stradebase/api burst           # concurrency/idempotency
```

