/**
 * Tiny TTL cache for read endpoints (balances / history). Under load, many clients poll the same
 * wallet; serving those from a short-lived cache collapses N identical RPC calls into one.
 *
 * Per-process. For a real deployment, the durable fix is an indexer/DB feeding these reads (see
 * docs/architecture.md) — this cache is the cheap first line that removes the worst of the RPC amplification.
 */
interface Hit {
  at: number;
  value: unknown;
  promise?: Promise<unknown>;
}

const store = new Map<string, Hit>();

/** Return a cached value if fresh; otherwise run `fn`, cache it, and coalesce concurrent misses. */
export async function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const hit = store.get(key);
  if (hit) {
    if (hit.promise) return hit.promise as Promise<T>;
    if (Date.now() - hit.at < ttlMs) return hit.value as T;
  }
  const promise = fn();
  store.set(key, { at: Date.now(), value: undefined, promise });
  try {
    const value = await promise;
    store.set(key, { at: Date.now(), value });
    return value;
  } catch (e) {
    store.delete(key);
    throw e;
  }
}

/** Drop cache entries whose key starts with `prefix` (e.g. after a write to that owner). */
export function invalidate(prefix: string): void {
  for (const k of store.keys()) if (k.startsWith(prefix)) store.delete(k);
}
