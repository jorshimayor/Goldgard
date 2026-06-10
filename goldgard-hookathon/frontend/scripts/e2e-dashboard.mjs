const baseUrl = process.env.BASE_URL ?? "http://127.0.0.1:3001";
const chainId = Number(process.env.CHAIN_ID ?? "11155111");
const expectedHex =
  process.env.EXPECTED_CHAIN_HEX ??
  (chainId === 11155111 ? "0xaa36a7" : chainId === 31337 ? "0x7a69" : "");

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function postJson(path, body) {
  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`Non-JSON response from ${path}: ${text.slice(0, 200)}`);
  }
  return { ok: res.ok, status: res.status, json, headers: res.headers };
}

async function rpc(chainId, method, params = []) {
  return postJson(`/api/rpc/${chainId}`, { jsonrpc: "2.0", id: 1, method, params });
}

async function assertChainHealthy(chainId, expectedHex) {
  const r = await rpc(chainId, "eth_chainId");
  if (!r.ok) throw new Error(`chain ${chainId} chainId call failed (${r.status}): ${JSON.stringify(r.json)}`);
  if (r.json.result !== expectedHex) throw new Error(`chain ${chainId} expected ${expectedHex}, got ${r.json.result}`);
  if (r.headers.get("x-goldgard-chain-id") !== String(chainId))
    throw new Error(`chain ${chainId} missing x-goldgard-chain-id header`);

  const b = await rpc(chainId, "eth_blockNumber");
  if (!b.ok) throw new Error(`chain ${chainId} blockNumber failed (${b.status}): ${JSON.stringify(b.json)}`);
  if (typeof b.json.result !== "string" || !b.json.result.startsWith("0x"))
    throw new Error(`chain ${chainId} bad blockNumber result: ${JSON.stringify(b.json)}`);
}

async function assertEventStreamHealthy(chainId) {
  const res = await fetch(`${baseUrl}/api/events/${chainId}?pollMs=750&backfillBlocks=0`);
  if (!res.ok || !res.body) {
    throw new Error(`events stream failed (${res.status})`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let sawHello = false;
  let sawPing = false;
  const started = Date.now();

  while (Date.now() - started < 8_000 && (!sawHello || !sawPing)) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const chunks = buf.split("\n\n");
    buf = chunks.pop() ?? "";
    for (const chunk of chunks) {
      if (chunk.includes("event: hello")) sawHello = true;
      if (chunk.includes("event: ping")) sawPing = true;
    }
  }

  try {
    await reader.cancel();
  } catch {
  }

  if (!sawHello || !sawPing) {
    throw new Error(`events stream unhealthy for chain ${chainId}: hello=${sawHello} ping=${sawPing}`);
  }
}

async function assertRpcFreshness(chainId) {
  const first = await rpc(chainId, "eth_blockNumber");
  if (!first.ok) throw new Error(`chain ${chainId} blockNumber failed: ${JSON.stringify(first.json)}`);
  await sleep(4_500);
  const second = await rpc(chainId, "eth_blockNumber");
  if (!second.ok) throw new Error(`chain ${chainId} blockNumber failed (2nd): ${JSON.stringify(second.json)}`);
  if (typeof second.json.result !== "string" || !second.json.result.startsWith("0x"))
    throw new Error(`chain ${chainId} bad blockNumber result (2nd): ${JSON.stringify(second.json)}`);
}

async function loadTestRpc(chainId, requests = 20, concurrency = 4) {
  const start = Date.now();
  let ok = 0;
  let fail = 0;
  const timings = [];
  let idx = 0;
  async function worker() {
    while (true) {
      const cur = idx;
      idx += 1;
      if (cur >= requests) return;

      const t0 = Date.now();
      let success = false;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const r = await rpc(chainId, "eth_blockNumber");
          if (r.ok) {
            success = true;
            break;
          }
        } catch {
        }
        await sleep(250 * (attempt + 1));
      }
      const dt = Date.now() - t0;
      timings.push(dt);
      if (success) ok += 1;
      else fail += 1;
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  const total = Date.now() - start;
  timings.sort((a, b) => a - b);
  const p50 = timings[Math.floor(timings.length * 0.5)] ?? 0;
  const p95 = timings[Math.floor(timings.length * 0.95)] ?? 0;
  return { totalMs: total, ok, fail, p50, p95 };
}

async function assertDashboardHasNoMockMarkers() {
  const res = await fetch(`${baseUrl}/dashboard?chainId=${chainId}`, { method: "GET" });
  const html = await res.text();
  const forbidden = [
    "Position #418",
    "tick range -400",
    "$48,210.72",
    "synthetic stress test",
    "$11,940",
  ];
  for (const s of forbidden) {
    if (html.includes(s)) throw new Error(`Dashboard contains forbidden mock marker: ${s}`);
  }
}

async function maybeRunSimulation(chainId) {
  if (process.env.SIMULATE !== "true") return;
  const res = await fetch(`${baseUrl}/api/simulate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chainId, directionUp: true, moveBps: 250, steps: 2 }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.ok) {
    throw new Error(`simulate failed (${res.status}): ${JSON.stringify(json)}`);
  }
}

async function main() {
  console.log(`BASE_URL=${baseUrl}`);
  console.log(`CHAIN_ID=${chainId}`);

  if (!expectedHex) throw new Error(`Missing EXPECTED_CHAIN_HEX for chain ${chainId}`);
  await assertChainHealthy(chainId, expectedHex);
  await assertRpcFreshness(chainId);
  await assertEventStreamHealthy(chainId);

  await assertDashboardHasNoMockMarkers();
  await maybeRunSimulation(chainId);
  await assertEventStreamHealthy(chainId);

  const load = await loadTestRpc(chainId, 20, 4);
  console.log(`RPC load(${chainId}): ok=${load.ok} fail=${load.fail} p50=${load.p50}ms p95=${load.p95}ms total=${load.totalMs}ms`);
  if (load.fail > 2) throw new Error("RPC load test saw failures");
  console.log("OK");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
