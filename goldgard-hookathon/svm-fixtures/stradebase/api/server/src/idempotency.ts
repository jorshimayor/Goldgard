/**
 * In-memory idempotency for write endpoints. A client that sends the same `Idempotency-Key`
 * (e.g. on a retry during a burst) gets the original result instead of a second on-chain effect.
 * Concurrent duplicates are coalesced onto the in-flight promise. Failures are NOT cached, so a
 * genuine retry after an error re-executes.
 *
 * This is per-process; behind multiple replicas, back it with Redis (same interface).
 */
interface Entry {
  at: number;
  result?: unknown;
  promise?: Promise<unknown>;
}

const TTL_MS = 10 * 60 * 1000;
const store = new Map<string, Entry>();

export async function withIdempotency<T>(key: string | undefined, fn: () => Promise<T>): Promise<T> {
  if (!key) return fn();

  const existing = store.get(key);
  if (existing) {
    if (existing.promise) return existing.promise as Promise<T>;
    if (Date.now() - existing.at < TTL_MS) return existing.result as T;
  }

  const promise = fn();
  store.set(key, { at: Date.now(), promise });
  try {
    const result = await promise;
    store.set(key, { at: Date.now(), result });
    return result;
  } catch (e) {
    store.delete(key); // allow a real retry after a failure
    throw e;
  }
}

// Opportunistic cleanup so the map doesn't grow unbounded.
setInterval(() => {
  const cutoff = Date.now() - TTL_MS;
  for (const [k, v] of store) if (!v.promise && v.at < cutoff) store.delete(k);
}, 60_000).unref?.();
