/**
 * Standalone indexer worker: `pnpm --filter @stradebase/api indexer`.
 *
 * Runs the secondary-trade indexer as a long-lived poll loop, writing into the same store the
 * API reads from. In dev the API's read endpoint indexes on-demand, so this worker is an
 * optimization; in production you run it (with `INDEXER_STORE=postgres`) so state is durable and
 * shared. Reuses the service's configured connection, store, and listing source.
 */
import { getIndexer } from "../services/royalties.js";

const intervalMs = Number(process.env.INDEXER_INTERVAL_MS ?? 5_000);
const controller = new AbortController();
for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => {
    console.log(`[indexer] ${sig} received, stopping…`);
    controller.abort();
  });
}

const indexer = await getIndexer(); // connects the store (Postgres, if configured) first
console.log(`[indexer] starting; polling every ${intervalMs}ms`);
await indexer.start(intervalMs, controller.signal);
console.log("[indexer] stopped");
