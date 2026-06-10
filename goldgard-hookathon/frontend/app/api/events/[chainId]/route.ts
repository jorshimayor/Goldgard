import { NextResponse } from "next/server";
import { createPublicClient, decodeEventLog, http } from "viem";

import { getDemoConfigForChain, isConfiguredAddress } from "../../../../lib/demoConfig";

export const runtime = "nodejs";

const CHAIN_ENV: Record<number, string> = {
  31337: "LOCAL_RPC_URL",
  11155111: "SEPOLIA_RPC_URL",
  84532: "BASE_SEPOLIA_RPC_URL",
  11155420: "OPTIMISM_SEPOLIA_RPC_URL",
  421614: "ARBITRUM_SEPOLIA_RPC_URL",
  80002: "POLYGON_AMOY_RPC_URL",
};

function pickUpstreamUrl(chainId: number) {
  const envKey = CHAIN_ENV[chainId];
  if (!envKey) return null;
  return process.env[envKey] ?? null;
}

const eventAbi = [
  {
    type: "event",
    name: "AlertLevelRaised",
    inputs: [
      { indexed: false, name: "level", type: "uint8" },
      { indexed: false, name: "until", type: "uint64" },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "PremiumDiverted",
    inputs: [
      { indexed: true, name: "poolId", type: "bytes32" },
      { indexed: true, name: "payer", type: "address" },
      { indexed: false, name: "feeCurrency", type: "address" },
      { indexed: false, name: "feeAmount", type: "uint256" },
      { indexed: false, name: "usdcDeposited", type: "uint256" },
      { indexed: false, name: "premiumBps", type: "uint16" },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "OraclePriceUpdated",
    inputs: [
      { indexed: false, name: "twap", type: "uint256" },
      { indexed: false, name: "external_", type: "uint256" },
      { indexed: false, name: "deviationBps", type: "uint256" },
      { indexed: false, name: "timestamp", type: "uint256" },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "ReserveBalanceChanged",
    inputs: [
      { indexed: false, name: "newBalance", type: "uint256" },
      { indexed: false, name: "delta", type: "int256" },
      { indexed: true, name: "triggeredBy", type: "address" },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "ReserveBalanceChangedDetailed",
    inputs: [
      { indexed: true, name: "token", type: "address" },
      { indexed: false, name: "newBalance", type: "uint256" },
      { indexed: false, name: "delta", type: "int256" },
      { indexed: true, name: "triggeredBy", type: "address" },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "ClaimPaid",
    inputs: [
      { indexed: true, name: "lp", type: "address" },
      { indexed: false, name: "amount", type: "uint256" },
      { indexed: false, name: "reservePostBalance", type: "uint256" },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "EpochCheckpointed",
    inputs: [
      { indexed: true, name: "epochId", type: "uint64" },
      { indexed: false, name: "epochStartedAt", type: "uint64" },
      { indexed: false, name: "epochEndedAt", type: "uint64" },
      { indexed: false, name: "premiumIn", type: "uint256" },
      { indexed: false, name: "payoutOut", type: "uint256" },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "CallbackRequested",
    inputs: [
      { indexed: true, name: "target", type: "address" },
      { indexed: false, name: "data", type: "bytes" },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "ReactiveAlertLevelHandled",
    inputs: [{ indexed: false, name: "level", type: "uint8" }],
    anonymous: false,
  },
  {
    type: "event",
    name: "ReactiveTightenThresholdHandled",
    inputs: [{ indexed: false, name: "newThreshold", type: "uint256" }],
    anonymous: false,
  },
  {
    type: "event",
    name: "ReactivePremiumRateHandled",
    inputs: [{ indexed: false, name: "newRateBps", type: "uint256" }],
    anonymous: false,
  },
  {
    type: "event",
    name: "ReactiveEpochCheckpointHandled",
    inputs: [],
    anonymous: false,
  },
] as const;

function parsePositiveBigint(x: string | null) {
  if (!x) return null;
  try {
    const v = BigInt(x);
    if (v < 0n) return null;
    return v;
  } catch {
    return null;
  }
}

function clampInt(x: number, min: number, max: number) {
  if (!Number.isFinite(x)) return min;
  return Math.max(min, Math.min(max, x));
}

function jsonSafe(x: unknown): unknown {
  if (typeof x === "bigint") return x.toString();
  if (Array.isArray(x)) return x.map(jsonSafe);
  if (x && typeof x === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(x as Record<string, unknown>)) {
      out[k] = jsonSafe(v);
    }
    return out;
  }
  return x;
}

export async function GET(request: Request, context: { params: Promise<{ chainId: string }> }) {
  const { chainId: chainIdRaw } = await context.params;
  const chainId = Number(chainIdRaw);
  if (!Number.isFinite(chainId)) {
    return NextResponse.json({ error: "Invalid chainId" }, { status: 400 });
  }

  const upstreamUrl = pickUpstreamUrl(chainId);
  if (!upstreamUrl) {
    return NextResponse.json(
      {
        error: "Missing RPC configuration for this chainId.",
        chainId,
      },
      { status: 400 },
    );
  }

  const cfg = getDemoConfigForChain(chainId);
  const addresses = [
    cfg.hook,
    cfg.oracleAdapter,
    cfg.safetyModule,
    cfg.hedgeReserve,
    cfg.callbackReceiver ?? "0x0000000000000000000000000000000000000000",
    cfg.reactiveWatcher ?? "0x0000000000000000000000000000000000000000",
  ].filter(isConfiguredAddress) as `0x${string}`[];

  if (addresses.length === 0) {
    return NextResponse.json(
      { error: "No configured contract addresses for this chainId.", chainId },
      { status: 400 },
    );
  }

  const url = new URL(request.url);
  const fromBlockParam = parsePositiveBigint(url.searchParams.get("fromBlock"));
  const pollMs = clampInt(Number(url.searchParams.get("pollMs") ?? "1500"), 750, 5000);
  const backfillBlocks = parsePositiveBigint(url.searchParams.get("backfillBlocks")) ?? 256n;

  const client = createPublicClient({
    transport: http(upstreamUrl, { timeout: 8_000 }),
  });

  let latest: bigint;
  try {
    latest = await client.getBlockNumber();
  } catch (e) {
    return NextResponse.json(
      { error: "Upstream RPC request failed.", chainId, message: (e as Error).message },
      { status: 502 },
    );
  }

  const minFrom = latest > backfillBlocks ? latest - backfillBlocks : 0n;
  const startFrom = fromBlockParam !== null ? (fromBlockParam > minFrom ? fromBlockParam : minFrom) : minFrom;
  let cursor = startFrom > 0n ? startFrom - 1n : 0n;

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let stopped = false;
      let intervalId: number | null = null;
      let pingId: number | null = null;

      function send(event: string, data: unknown) {
        if (stopped) return;
        controller.enqueue(encoder.encode(`event: ${event}\n`));
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(jsonSafe(data))}\n\n`));
      }

      function stop() {
        if (stopped) return;
        stopped = true;
        try {
          if (intervalId !== null) clearInterval(intervalId);
          if (pingId !== null) clearInterval(pingId);
        } catch {
        }
        try {
          controller.close();
        } catch {
        }
      }

      request.signal.addEventListener("abort", stop);

      send("hello", { ok: true, chainId, startFrom, pollMs, addresses });

      async function tick() {
        if (stopped) return;
        let head: bigint;
        try {
          head = await client.getBlockNumber();
        } catch (e) {
          send("error", { chainId, error: "eth_blockNumber failed", message: (e as Error).message });
          return;
        }

        if (head <= cursor) {
          send("ping", { chainId, head, cursor, now: Date.now() });
          return;
        }

        let logs;
        try {
          logs = await client.getLogs({
            address: addresses,
            fromBlock: cursor + 1n,
            toBlock: head,
          });
        } catch (e) {
          send("error", { chainId, error: "eth_getLogs failed", message: (e as Error).message, head, cursor });
          return;
        }

        for (const log of logs) {
          try {
            const decoded = decodeEventLog({
              abi: eventAbi,
              data: log.data,
              topics: log.topics,
              strict: false,
            });
            if (!decoded.eventName) continue;
            send("log", {
              chainId,
              address: log.address,
              blockNumber: log.blockNumber?.toString() ?? null,
              txHash: log.transactionHash ?? null,
              logIndex: log.logIndex?.toString() ?? null,
              eventName: decoded.eventName,
              args: decoded.args ?? null,
            });
          } catch {
          }
        }

        cursor = head;
        send("ping", { chainId, head, cursor, now: Date.now() });
      }

      void tick();
      intervalId = setInterval(() => void tick(), pollMs) as unknown as number;
      pingId = setInterval(
        () => send("ping", { chainId, head: null, cursor, now: Date.now() }),
        15_000,
      ) as unknown as number;
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-goldgard-chain-id": String(chainId),
    },
  });
}
