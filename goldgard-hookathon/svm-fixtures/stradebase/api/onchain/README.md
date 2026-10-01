# @stradebase/onchain

Typed backend client for the two Solana programs (`royalty_shares`, `transfer_hook`).
It consumes the **generated** IDL + TS types from the Anchor build (`target/idl`,
`target/types`) so the backend never hand-writes account layouts or discriminators.

## Layout

| File | Purpose |
|------|---------|
| `idl/*.json` | Runtime IDLs (copied from `target/idl`) — passed to `new Program(...)` |
| `types/*.ts` | Generated TS types (copied from `target/types`) |
| `ids.ts` | Program ids, read from the IDL `address` field |
| `pdas.ts` | All PDA + ATA derivations (global config, identity, listing, share mint, compliance, position, trade, resolver metas) |
| `client.ts` | `createPrograms(provider)`, account readers, and instruction account-set builders |
| `scripts/sync-idl.sh` | Re-copy IDL/types after `anchor build` |

## Usage

```ts
import { AnchorProvider, Wallet } from "@anchor-lang/core";
import { Connection, Keypair } from "@solana/web3.js";
import { createPrograms, getListing, listingPda, buySharesAccounts } from "@stradebase/onchain";

const connection = new Connection(process.env.SOLANA_RPC_URL!, "confirmed");
const provider = new AnchorProvider(connection, new Wallet(backendKeypair), {});
const { royalty, hook } = createPrograms(provider);

// read a listing
const listing = listingPda(artistPubkey, songId /* 32 bytes */);
const data = await getListing(royalty, listing);

// build + send a primary purchase
const accounts = buySharesAccounts({
  buyer, artist, treasury, listing,
  shareMint: data.shareMint, sbstMint: data.royaltyVault /* use globalConfig.sbstMint */,
  tradeIndex: BigInt(data.tradeCount.toString()),
});
await royalty.methods.buyShares(new BN(10), Array(64).fill(0)).accounts(accounts).signers([buyerKp]).rpc();
```

For **secondary share transfers**, use `@solana/spl-token`'s
`createTransferCheckedWithTransferHookInstruction` — it auto-resolves the hook's
extra accounts from the on-chain `ExtraAccountMetaList`. All required compliance
PDAs (identities, position, compliance config, listing) must already exist on-chain
or the hook rejects the transfer.

## Keeping in sync

After any change to the on-chain program interface:

```bash
# from repo root
anchor build
cd api/onchain && npm run sync-idl && npm run typecheck
```
