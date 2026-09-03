# The API, request by request (`api.http` explained)

A literal, top-to-bottom walkthrough of every request in [api.http](api.http) — the runnable file
Kwame uses to hit the backend. Plain enough for Conrad to follow what each call *means*, precise
enough for Kwame to know the endpoint, who signs it, and what it returns.

**How to read this:** each section below matches a section in `api.http`. Open them side by side and
you can follow line for line. "Signed by" is which key authorises the call (see the roles below).

> **Reminder — money vs. ownership.** These endpoints move *share ownership* and write *records* on
> the ledger. They do **not** move cash. Pounds/dollars settle separately through the payment rails
> (see [payments-fx.md](payments-fx.md)). Where a call says "records" a sale or payout, the money was
> handled off-chain and the ledger is noting it for the audit trail.

***

## The three roles (who signs what)

The file starts by defining wallets. Three kinds matter:

| Role | Which key | What it is |
|---|---|---|
| **deployer** | `id.json` (the "upgrade authority") | bootstraps the platform; becomes the **ops authority**. Signs the platform-level controls. |
| **admin** | `admin.json` (= the server's `ADMIN_SECRET_KEY`) | the **custodial platform key**: mints/freezes the pound token, is the **compliance authority**, and the treasury. Signs the token side and all compliance/identity calls. |
| **users** (owner / recipient / artist / buyer / buyer2) | one wallet each | ordinary end-user wallets used in the demo. |

Two values — `@listing` and `@shareMint` — are **filled in from a response**: you create a listing,
copy the two IDs it returns into those variables, and the later listing-specific calls use them.

***

## Health & discovery

| In the file | What it does | Signed by |
|---|---|---|
| `GET /health` | Is the API alive? Returns a small status blob. | — (public) |
| `GET /tokens` | Lists the supported currencies (SBTS/USDC/USDT) and whether we can mint/freeze each. | — (public) |

## Tokens — the pound (SBTS) and the two dollar coins

| In the file | What it does | Signed by |
|---|---|---|
| `POST /mint` `{to, amount}` | Create new SBTS (our pound) and credit a wallet. Only SBTS can be minted (it's ours); USDC/USDT can't. | **admin** |
| `GET /balances/:owner` | All of a wallet's balances (SBTS + USDC + USDT). | — |
| `GET /balances/:owner/unified` | The **single pounds figure** across everything — dollar holdings converted to pounds, all rounding/formatting done server-side so the app just shows the number. | — |
| `GET /balances/:owner/SBTS` | One specific balance. | — |
| `POST /transfer` `{to, symbol, amount, fromSecret?}` | Move tokens from one wallet to another. With `fromSecret` the sender signs; without it, it sends from the treasury. | sender (or **admin** treasury) |
| `POST /transfer` (USDC / USDT) | Same call, moving the dollar coins from the treasury to a recipient. | **admin** treasury |

## Transaction history

| In the file | What it does | Signed by |
|---|---|---|
| `GET /history/:owner?limit=20` | Combined recent activity across all three currencies, newest first. | — |
| `GET /history/:owner/SBTS` (and USDC, USDT) | Activity for one currency; paginate with `&before=<id>`. | — |

## Admin — freezing token accounts

| In the file | What it does | Signed by |
|---|---|---|
| `POST /admin/freeze` `{owner, symbol: SBTS}` | Freeze a wallet's SBTS so it can't move — e.g. a compliance hold. | **admin** |
| `POST /admin/thaw` | Un-freeze it. | **admin** |
| `POST /admin/freeze` `{symbol: USDC}` | **Deliberately returns an error (400).** We don't control USDC/USDT, so we can't freeze them — this proves the guard works. | **admin** |

## Bulk distribution (fast, high-volume drops)

For a busy sale/drop: pre-make a supply, then send to many people in parallel.

| In the file | What it does | Signed by |
|---|---|---|
| `POST /distribute/prefund` `{amountEach}` | One-time top-up of the internal "sending" accounts before a big drop. | **admin** |
| `POST /distribute` `{recipients[]}` + `Idempotency-Key` | Send SBTS to many recipients at once. The idempotency key makes the whole batch **safe to retry** without double-sending. | **admin** |

## NFTs (tier collectibles / perks)

| In the file | What it does | Signed by |
|---|---|---|
| `POST /nfts/collection` `{name, uri}` | Create a collection to group the NFTs (optional). | **admin** |
| `POST /nfts/mint` `{name, uri, owner}` | Mint a tier NFT to a user. | **admin** |
| `GET /nfts/:asset` | Look up an NFT's details. | — |
| `POST /admin/nft/freeze` / `/thaw` `{asset}` | Freeze or un-freeze an NFT. | **admin** |

***

## Royalty shares — the full lifecycle

This is the core: set up the platform, verify people, list a song, buy/sell shares, record payouts.

### Set-up (once)

| In the file | What it does | Signed by |
|---|---|---|
| `POST /royalties/init` `{secret, complianceAuthority, treasury, platformFeeBps, maxGlobalOwnershipBps}` | Bootstraps the platform once. The signer becomes the **ops authority**; the compliance authority + treasury are set to the **admin** wallet. | **deployer** |
| `GET /royalties/config` | Read the platform settings back. | — |

### Identity & privacy

| In the file | What it does | Signed by |
|---|---|---|
| `POST /royalties/identity` `{user, kycLevel, jurisdiction, accredited, status, pii}` | Record a user's KYC. Their personal data (`pii`) is **hashed by the API** — only a one-way fingerprint lands on the ledger. **Returns a `salt`** that must be stored: without it the fingerprint can never be re-derived; deleting it is the "right to be forgotten" mechanism. | **admin** |
| `GET /royalties/identity/:user` | Read status + fingerprint only — **never** the personal data. | — |
| `POST /royalties/identity` `{status: restricted}` | Soft-freeze a wallet under review: it may still hold and receive, but can't buy or send. | **admin** |
| `POST /royalties/pii` `{user, pii}` | Re-record personal data after a re-verification, **without touching** the compliance status (kept separate on purpose, so a routine refresh can't accidentally un-freeze someone). | **admin** |

### Profiles & usernames

| In the file | What it does | Signed by |
|---|---|---|
| `POST /royalties/profile` `{role}` | Create a user's profile (artist / investor / both). Required before listing or buying. | the **user** |
| `GET /royalties/profile/:user` | Read a profile (role + counters). | — |
| `POST /royalties/username` `{username, payerSecret}` | Claim an **opt-in public name** — signed by the user, with the platform paying the small on-chain cost (`payerSecret`). | the **user** |
| `GET /royalties/username/:name` | Look up who owns a name (empty if unclaimed). | — |
| `POST /royalties/username/release` `{username}` | Give the name up; it becomes claimable again. | the **user** |
| `POST /royalties/profile/role` `{role}` | Change your own role. | the **user** |

### Listing & primary sale

| In the file | What it does | Signed by |
|---|---|---|
| `POST /royalties/listings` `{songId, metadataUri, totalShares, pricePerShare, lockupSeconds, requiresAccredited, allowedJurisdictions, maxSharesPerWallet}` | An artist lists a song as a fixed number of shares, with its rules. **Returns `listing` + `shareMint`** — copy them into the file's variables. | **artist** |
| `GET /royalties/listings` | List everything on the platform. | — |
| `POST /royalties/hook-metas` `{shareMint}` | One-time setup so the automatic rule-check runs on every future transfer of this listing's shares. | **admin** |
| `POST /royalties/buy` `{listing, shares, settlementAmount}` | A buyer buys shares. **Moves no money** — the payment was settled off-chain first; `settlementAmount` is recorded on the trade as the audit reference. | **buyer** |
| `GET /royalties/positions/:mint/:owner` | A holder's position (e.g. when their lock-up ends). | — |

### Payouts, resale, and the audit trail

| In the file | What it does | Signed by |
|---|---|---|
| `POST /royalties/distribute` `{listing, totalAmount, reference}` | Record a royalty payout the platform made off-chain. No funds move on-chain; `reference` is your off-chain payout-batch id. | **deployer** (ops) |
| `GET /royalties/distributions/:listing` | Read the recorded payouts (audit trail). | — |
| `POST /royalties/transfer` `{listing, buyer, shares, settlementAmount}` | A **resale**: transfers the shares **and** writes the trade record in the **same step** — the record can't be written unless the matching share transfer is in the same transaction, so the two can never disagree. | **seller** |
| `GET /royalties/trades/:listing` | The full ordered trade history for a listing (first sale → every resale), read from the ledger. | — |
| `GET /royalties/reconcile/:listing` | **Audit safety net:** flags any share movement with no matching record. Should come back empty. | — |

***

## Royalty admin & compliance

The controls the platform operator uses.

| In the file | What it does | Signed by |
|---|---|---|
| `POST /royalties/admin/block` `{shareMint, user}` | Block a wallet from a specific listing. | **admin** |
| `POST /royalties/admin/unblock` | Un-block it. | **admin** |
| `POST /royalties/admin/compliance` `{shareMint, maxSharesPerWallet}` | Set the per-wallet ownership cap for a listing. | **admin** |
| `POST /royalties/admin/listing-status` `{listing, status}` | Set a listing to `active` / `paused` / `closed`. | **deployer** (ops) |
| `POST /royalties/admin/pause` `{paused}` | **Global circuit breaker** — halt or resume all activity. | **deployer** (ops) |
| `POST /royalties/admin/fee` `{platformFeeBps}` | Adjust the platform fee (in basis points; 250 = 2.5%). | **deployer** (ops) |

***

## The shape of a real run

Read top to bottom, the file tells one story: **check the API is up → set up the pound token and
balances → verify a user's identity (privately) → give them a profile and optional name → an artist
lists a song → turn on the rule-check → a buyer buys → record a royalty payout → a resale happens
and is recorded atomically → read the full history and reconcile it → exercise the admin controls.**

Every write is authorised by exactly one of the three roles, every rule is enforced automatically,
and every sale/payout leaves a permanent, reconcilable record — while the actual cash moves
separately through the payment rails.

See [api.md](api.md) for the formal endpoint reference, [devnet.md](devnet.md) for running it
end to end, and [payments-fx.md](payments-fx.md) for how the money settles.
