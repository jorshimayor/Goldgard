/**
 * Secondary-trade indexer — reconstructs on-chain share transfers into structured records.
 *
 * Shares stay real, transferable Token-2022 tokens, so a resale is an on-chain token movement
 * the `royalty_shares` program never writes a `TradeRecord` for. This service closes that gap:
 * it walks each share mint's signature history, reconstructs owner→owner moves from balance
 * deltas (see `core.ts`), and persists them so the backend has resales in the same shape as
 * primary sales — the DB reflecting the chain.
 *
 * Two modes, both cursor-based so they're incremental and idempotent:
 *   - `indexMint` / `indexAll` — a single catch-up pass (used on-demand by the read endpoint).
 *   - `start` — a poll loop for a long-running background worker.
 */
import type { Connection, ConfirmedSignatureInfo, PublicKey } from "@solana/web3.js";
import { extractShareMoves } from "./core.js";
import type { IndexerStore } from "./store.js";

export interface ListingMint {
  listing: string;
  mint: PublicKey;
}

/** How to enumerate the listings (mints) to index. Injected so the loop and tests can differ. */
export type ListingSource = () => Promise<ListingMint[]>;

const PAGE = 1000; // getSignaturesForAddress hard cap

export class Indexer {
  constructor(
    private readonly conn: Connection,
    private readonly store: IndexerStore,
    private readonly listings: ListingSource,
  ) {}

  /** Catch a single mint up to chain tip. Returns the number of secondary trades recorded. */
  async indexMint({ listing, mint }: ListingMint): Promise<number> {
    const mintStr = mint.toBase58();
    const cursor = await this.store.getCursor(mintStr);

    // Collect every signature newer than the cursor (newest-first from the RPC), paging back.
    const fresh: ConfirmedSignatureInfo[] = [];
    let before: string | undefined;
    for (;;) {
      const page = await this.conn.getSignaturesForAddress(mint, {
        before,
        until: cursor ?? undefined,
        limit: PAGE,
      });
      if (page.length === 0) break;
      fresh.push(...page);
      before = page[page.length - 1].signature;
      if (page.length < PAGE) break;
    }
    if (fresh.length === 0) return 0;

    // Process oldest→newest so the cursor only ever advances.
    fresh.reverse();
    let recorded = 0;
    for (const sig of fresh) {
      if (sig.err) continue;
      const tx = await this.conn.getParsedTransaction(sig.signature, {
        commitment: "confirmed",
        maxSupportedTransactionVersion: 0,
      });
      for (const move of extractShareMoves(tx?.meta, mintStr)) {
        await this.store.upsertTrade({
          signature: sig.signature,
          logIndex: move.logIndex,
          mint: mintStr,
          listing,
          seller: move.seller,
          buyer: move.buyer,
          amount: move.amount,
          slot: sig.slot,
          blockTime: sig.blockTime ?? null,
        });
        recorded++;
      }
    }
    // Advance the cursor to the newest signature we saw, even if it held no share move, so we
    // never re-scan it. `fresh` is oldest→newest after the reverse, so the last is newest.
    await this.store.setCursor(mintStr, fresh[fresh.length - 1].signature);
    return recorded;
  }

  /** One catch-up pass across every known listing. Returns total trades recorded. */
  async indexAll(): Promise<number> {
    const listings = await this.listings();
    let total = 0;
    for (const lm of listings) total += await this.indexMint(lm);
    return total;
  }

  /**
   * Run `indexAll` on a fixed interval until `signal` aborts. Errors in one pass are logged and
   * the loop continues — a transient RPC failure must not kill the worker.
   */
  async start(intervalMs = 5_000, signal?: AbortSignal): Promise<void> {
    while (!signal?.aborted) {
      try {
        const n = await this.indexAll();
        if (n > 0) console.log(`[indexer] recorded ${n} secondary trade(s)`);
      } catch (e: any) {
        console.error(`[indexer] pass failed: ${e?.message ?? e}`);
      }
      await new Promise((r) => setTimeout(r, intervalMs));
    }
  }
}
