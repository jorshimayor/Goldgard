import { NextResponse } from "next/server";

export const runtime = "nodejs";

const CHAIN_ENV: Record<number, string> = {
  1: "MAINNET_RPC_URL",
  5: "GOERLI_RPC_URL",
  11155111: "SEPOLIA_RPC_URL",
  31337: "DEMO_RPC_URL",
};

function pickUpstreamUrl(chainId: number) {
  const envKey = CHAIN_ENV[chainId];
  if (!envKey) return null;
  return process.env[envKey] ?? null;
}

type JsonRpcRequest = { jsonrpc?: string; id?: unknown; method?: unknown; params?: unknown };

function isSingleChainIdRequest(x: unknown): x is JsonRpcRequest {
  if (!x || typeof x !== "object") return false;
  const m = (x as { method?: unknown }).method;
  return m === "eth_chainId";
}

export async function POST(
  request: Request,
  context: { params: Promise<{ chainId: string }> },
) {
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

  const payload = await request.text();
  if (!payload) {
    return NextResponse.json({ error: "Missing JSON-RPC payload." }, { status: 400 });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  const wantsChainIdValidation = isSingleChainIdRequest(parsed);

  let res: Response;
  try {
    res = await fetch(upstreamUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(parsed),
      cache: "no-store",
      signal: controller.signal,
    });
  } catch (e) {
    clearTimeout(timeout);
    return NextResponse.json(
      { error: "Upstream RPC request failed.", chainId, message: (e as Error).message },
      { status: 502 },
    );
  } finally {
    clearTimeout(timeout);
  }

  const text = await res.text();

  if (wantsChainIdValidation) {
    try {
      const json = JSON.parse(text) as { result?: unknown; error?: unknown };
      const got = Number.parseInt(String(json.result ?? "0x0"), 16);
      if (Number.isFinite(got) && got !== chainId) {
        return NextResponse.json(
          { error: "Upstream RPC chainId mismatch.", expectedChainId: chainId, gotChainId: got },
          { status: 502 },
        );
      }
    } catch {
    }
  }

  return new NextResponse(text, {
    status: res.status,
    headers: {
      "content-type": res.headers.get("content-type") ?? "application/json",
      "x-goldgard-chain-id": String(chainId),
    },
  });
}
