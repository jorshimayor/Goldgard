const baseUrl = process.env.BASE_URL ?? "http://127.0.0.1:3000";

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

async function assertRpcFreshness(chainId) {
  const first = await rpc(chainId, "eth_blockNumber");
  if (!first.ok) throw new Error(`chain ${chainId} blockNumber failed: ${JSON.stringify(first.json)}`);
  await sleep(4_500);
  const second = await rpc(chainId, "eth_blockNumber");
  if (!second.ok) throw new Error(`chain ${chainId} blockNumber failed (2nd): ${JSON.stringify(second.json)}`);
  if (typeof second.json.result !== "string" || !second.json.result.startsWith("0x"))
    throw new Error(`chain ${chainId} bad blockNumber result (2nd): ${JSON.stringify(second.json)}`);
}

async function loadTestRpc(chainId, requests = 50) {
  const start = Date.now();
  let ok = 0;
  let fail = 0;
  const timings = [];
  await Promise.all(
    Array.from({ length: requests }, async () => {
      const t0 = Date.now();
      try {
        const r = await rpc(chainId, "eth_blockNumber");
        const dt = Date.now() - t0;
        timings.push(dt);
        if (r.ok) ok += 1;
        else fail += 1;
      } catch {
        const dt = Date.now() - t0;
        timings.push(dt);
        fail += 1;
      }
    }),
  );
  const total = Date.now() - start;
  timings.sort((a, b) => a - b);
  const p50 = timings[Math.floor(timings.length * 0.5)] ?? 0;
  const p95 = timings[Math.floor(timings.length * 0.95)] ?? 0;
  return { totalMs: total, ok, fail, p50, p95 };
}

async function assertDashboardHasNoMockMarkers() {
  const res = await fetch(`${baseUrl}/dashboard`, { method: "GET" });
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

async function main() {
  console.log(`BASE_URL=${baseUrl}`);

  await assertChainHealthy(1, "0x1");
  await assertChainHealthy(11155111, "0xaa36a7");
  await assertChainHealthy(5, "0x5");
  await assertRpcFreshness(1);
  await assertRpcFreshness(11155111);
  await assertRpcFreshness(5);

  const anvil = await rpc(31337, "eth_chainId");
  if (anvil.ok) {
    if (anvil.json.result !== "0x7a69") throw new Error(`anvil expected 0x7a69 got ${anvil.json.result}`);
    await assertRpcFreshness(31337);
  } else {
    console.log("Skipping anvil health (missing DEMO_RPC_URL or anvil not running).");
  }

  await assertDashboardHasNoMockMarkers();

  const load = await loadTestRpc(1, 40);
  console.log(`RPC load(mainnet): ok=${load.ok} fail=${load.fail} p50=${load.p50}ms p95=${load.p95}ms total=${load.totalMs}ms`);
  if (load.fail > 0) throw new Error("RPC load test saw failures");
  console.log("OK");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
