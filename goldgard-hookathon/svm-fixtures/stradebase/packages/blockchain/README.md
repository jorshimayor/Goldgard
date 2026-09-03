# @stradebase/blockchain

Multi-token Solana layer for Stradebase, implementing the blockchain side of the *USD Stablecoin Support and Global Off-Ramp Integration* plan. Adds full USDC and USDT support alongside the native STBS stablecoin (GBP-pegged, Token-2022) and hands the backend a clean, typed API for ATA management, balances, transfers, and transaction parsing.

No new smart contracts or token mints are required — everything runs against the existing SPL Token / Token-2022 programs, keeping blockchain usage fully abstracted behind the backend API.

## Mint addresses & program IDs

| Token | Peg | Program | Mainnet mint | Decimals |
|-------|-----|---------|--------------|----------|
| STBS | GBP | Token-2022 `TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb` | *your existing STBS mint — pass via config* | 9 (configurable) |
| USDC | USD | Token `TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA` | `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` | 6 |
| USDT | USD | Token `TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA` | `Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB` | 6 |

Associated Token Program: `ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL`

Devnet: USDC defaults to Circle's faucet mint `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`; USDT has no canonical devnet mint, so pass a test mint explicitly.

## Install & build

```bash
npm install
npm run build   # emits dist/ with .d.ts types
npm test        # 22 unit tests (vitest)
```

## Setup

```ts
import { Connection, PublicKey, clusterApiUrl } from "@solana/web3.js";
import { createTokenRegistry } from "@stradebase/blockchain";

const connection = new Connection(process.env.SOLANA_RPC_URL!, "confirmed");

const registry = createTokenRegistry({
  cluster: "mainnet-beta",
  stbsMint: process.env.STBS_MINT!,   // your existing Token-2022 mint
  stbsDecimals: 9,                     // set to your mint's actual decimals
});
```

The registry is the single source of truth: every helper takes a `TokenConfig` from it, so the correct token program (Token vs Token-2022) is always used. This matters — ATA derivation includes the program ID, and using the wrong one produces a wrong address that silently receives nothing.

## Usage patterns

### Balances (`/balance` endpoint)

```ts
import { getAllBalances, getTokenBalance } from "@stradebase/blockchain";

const owner = new PublicKey(userWalletAddress);
const balances = await getAllBalances(connection, owner, registry);
// [{ symbol: "STBS", ui: "150.25", raw: 150250000000n, exists: true, ... },
//  { symbol: "USDC", ui: "42.1", ... }, { symbol: "USDT", ui: "0", exists: false, ... }]
```

A missing ATA is reported as `exists: false` with zero balance — never an error.

### Transfers

```ts
import { toBaseUnits, sendTransfer, buildTransferTransaction } from "@stradebase/blockchain";

// Backend-custodied signing:
const signature = await sendTransfer(
  connection,
  {
    from: senderPubkey,
    to: recipientPubkey,
    token: registry.USDC,
    amount: toBaseUnits("25.50", registry.USDC.decimals),
  },
  [senderKeypair]
);

// Or build unsigned and sign elsewhere:
const tx = await buildTransferTransaction(connection, { from, to, token: registry.STBS, amount });
```

Every transfer bundles an *idempotent* recipient-ATA creation (no-op if it exists — no check-then-create race) and uses `transferChecked`, which validates mint and decimals on chain and is required for Token-2022.

### Transaction history (`/transactions` endpoint)

```ts
import { getTokenHistory } from "@stradebase/blockchain";

const history = await getTokenHistory(connection, owner, registry.USDC, registry, { limit: 20 });
// [{ signature, blockTime, symbol: "USDC", uiChange: "-2.5", rawChange: -2500000n, ... }]
// Paginate with { before: lastSignature }
```

Parsing is based on pre/post token-balance deltas rather than instruction decoding, so it correctly handles classic Token, Token-2022, and CPI-wrapped transfers (e.g. future DEX swaps).

### Amount handling

All amounts are `bigint` base units internally. Convert at the API boundary with `toBaseUnits("12.34", decimals)` / `fromBaseUnits(raw, decimals)`. No floating point is ever used for money — inputs with too many decimal places or malformed values throw.

## Backend integration notes (for the `/offramp` flow)

Off-ramping to Alchemy Pay / SpherePay is a fiat-side concern, but the on-chain leg is just a transfer to the provider's deposit address:

```ts
const sig = await sendTransfer(connection, {
  from: userWallet,
  to: new PublicKey(providerDepositAddress), // from Alchemy Pay / SpherePay session
  token: registry.USDC,
  amount: toBaseUnits(offrampAmount, registry.USDC.decimals),
}, [userKeypair]);
// pass `sig` back to the provider session as proof of deposit
```

Validation the backend should keep at the endpoint layer: token symbol whitelist (`STBS | USDC | USDT`), wallet address parse (`new PublicKey(...)` throws on bad input), amount via `toBaseUnits` (throws on bad input), and balance pre-checks (done automatically inside `sendTransfer`).

## Module map

| File | Purpose |
|------|---------|
| `src/tokens.ts` | Token registry, mint/program constants, lookup by mint |
| `src/amounts.ts` | bigint-safe UI ↔ base-unit conversion |
| `src/ata.ts` | Program-aware ATA derivation, idempotent creation, existence check |
| `src/balances.ts` | Single- and multi-token balance retrieval |
| `src/transfers.ts` | Transfer instruction/transaction builders + send-and-confirm |
| `src/transactions.ts` | Balance-delta transaction parsing + paginated history |

## Deliberately out of scope (per plan)

DEX swap integration (STBS ↔ USDC/USDT) and the artist→buyer sale contract were deferred. The parsing layer already tolerates swap transactions when they arrive.
