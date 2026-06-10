import { useEffect, useMemo, useRef, useState } from "react";

export type EventStreamLog = {
  chainId: number;
  address: string;
  blockNumber: string | null;
  txHash: string | null;
  logIndex: string | null;
  eventName: string;
  args: unknown;
};

type EventStreamState = {
  connected: boolean;
  lastPingAt: number | null;
  lastLogAt: number | null;
  lastHead: bigint | null;
  lastCursor: bigint | null;
  error: string | null;
  logs: EventStreamLog[];
};

function parseBigintOrNull(x: unknown) {
  if (typeof x !== "string") return null;
  try {
    return BigInt(x);
  } catch {
    return null;
  }
}

function parsePingPayload(data: unknown) {
  if (!data || typeof data !== "object") return { head: null as bigint | null, cursor: null as bigint | null };
  const head = parseBigintOrNull((data as { head?: unknown }).head);
  const cursor = parseBigintOrNull((data as { cursor?: unknown }).cursor);
  return { head, cursor };
}

function stableKey(chainId: number) {
  return `gg:eventCursor:${chainId}`;
}

function getStoredCursor(chainId: number) {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(stableKey(chainId));
    if (!raw) return null;
    return BigInt(raw);
  } catch {
    return null;
  }
}

function storeCursor(chainId: number, cursor: bigint) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(stableKey(chainId), cursor.toString());
  } catch {
  }
}

export function useEventStream(chainId: number, opts?: { enabled?: boolean; keepLast?: number; pollMs?: number }) {
  const enabled = opts?.enabled ?? true;
  const keepLast = opts?.keepLast ?? 50;
  const pollMs = opts?.pollMs ?? 1500;

  const [state, setState] = useState<EventStreamState>({
    connected: false,
    lastPingAt: null,
    lastLogAt: null,
    lastHead: null,
    lastCursor: null,
    error: null,
    logs: [],
  });

  const cursorRef = useRef<bigint | null>(null);
  const seenRef = useRef<Set<string>>(new Set());

  const url = useMemo(() => {
    if (!enabled) return null;
    const stored = getStoredCursor(chainId);
    cursorRef.current = stored;
    const u = new URL(`/api/events/${chainId}`, window.location.origin);
    if (stored !== null) u.searchParams.set("fromBlock", stored.toString());
    u.searchParams.set("pollMs", String(pollMs));
    return u.toString();
  }, [chainId, enabled, pollMs]);

  useEffect(() => {
    if (!enabled || !url) return;

    let alive = true;
    const es = new EventSource(url);

    const markConnected = () =>
      setState((s) => ({
        ...s,
        connected: true,
        error: null,
      }));

    const markError = (message: string) =>
      setState((s) => ({
        ...s,
        connected: false,
        error: message,
      }));

    es.onopen = () => {
      if (!alive) return;
      markConnected();
    };

    es.addEventListener("ping", (ev) => {
      if (!alive) return;
      markConnected();
      try {
        const data = JSON.parse(String((ev as MessageEvent).data)) as unknown;
        const { head, cursor } = parsePingPayload(data);
        if (cursor !== null) {
          cursorRef.current = cursor;
          storeCursor(chainId, cursor);
        }
        setState((s) => ({
          ...s,
          lastPingAt: Date.now(),
          lastHead: head ?? s.lastHead,
          lastCursor: cursor ?? s.lastCursor,
        }));
      } catch {
        setState((s) => ({ ...s, lastPingAt: Date.now() }));
      }
    });

    es.addEventListener("log", (ev) => {
      if (!alive) return;
      markConnected();
      try {
        const parsed = JSON.parse(String((ev as MessageEvent).data)) as EventStreamLog;
        const key = `${parsed.chainId}:${parsed.txHash ?? "0x"}:${parsed.logIndex ?? "0"}`;
        if (seenRef.current.has(key)) return;
        seenRef.current.add(key);
        setState((s) => {
          const nextLogs = [parsed, ...s.logs].slice(0, keepLast);
          return { ...s, logs: nextLogs, lastLogAt: Date.now() };
        });
      } catch {
      }
    });

    es.addEventListener("error", (ev) => {
      if (!alive) return;
      try {
        const msg = JSON.parse(String((ev as MessageEvent).data)) as { error?: unknown; message?: unknown };
        markError(`${String(msg.error ?? "stream error")}: ${String(msg.message ?? "")}`.trim());
      } catch {
        markError("stream error");
      }
    });

    es.onerror = () => {
      if (!alive) return;
      markError("Event stream connection failed");
    };

    return () => {
      alive = false;
      try {
        es.close();
      } catch {
      }
    };
  }, [chainId, enabled, keepLast, url]);

  const healthy = state.connected && (state.lastPingAt ? Date.now() - state.lastPingAt < 30_000 : false);

  return { ...state, healthy };
}

