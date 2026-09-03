/**
 * API bench/smoke runner — exercises the whole `docs/api.http` flow against a running server and
 * asserts the expected result for every endpoint, with per-call latency.
 *
 *   pnpm --filter @stradebase/api apitest              # against http://localhost:8080
 *   API_BASE_URL=https://api.devnet.stradebase.xyz pnpm --filter @stradebase/api apitest
 *
 * Prereqs: the API is running (`pnpm --filter @stradebase/api dev`) with a valid .env, and both
 * programs are deployed on the target cluster. Reads the admin key from ADMIN_SECRET_KEY and the
 * ops/deployer key from DEPLOYER_SECRET (JSON array) or ~/.config/solana/id.json.
 *
 * Re-runnable: every run mints to fresh ephemeral wallets and uses a unique songId, so it never
 * collides with prior state. Steps that would need external funding (USDC/USDT treasury transfers)
 * or a specific cluster feature are checked and SKIPPED cleanly rather than failed.
 */
import "dotenv/config"; // loads api/server/.env (cwd) → ADMIN_SECRET_KEY etc.
import { Connection, Keypair, LAMPORTS_PER_SOL, SystemProgram, Transaction } from "@solana/web3.js";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const BASE = process.env.API_BASE_URL ?? "http://localhost:8080";

// ---- keys -------------------------------------------------------------------
function loadArray(name: string, json: string): number[] {
  try {
    const a = JSON.parse(json);
    if (!Array.isArray(a)) throw 0;
    return a;
  } catch {
    throw new Error(`${name} must be a JSON secret-key array`);
  }
}
function kpFrom(arr: number[]): Keypair {
  return Keypair.fromSecretKey(Uint8Array.from(arr));
}
const adminSecret = loadArray("ADMIN_SECRET_KEY", process.env.ADMIN_SECRET_KEY ?? "");
const admin = kpFrom(adminSecret);

let deployerSecret: number[] | null = null;
try {
  deployerSecret = process.env.DEPLOYER_SECRET
    ? loadArray("DEPLOYER_SECRET", process.env.DEPLOYER_SECRET)
    : (JSON.parse(readFileSync(join(homedir(), ".config/solana/id.json"), "utf8")) as number[]);
} catch {
  deployerSecret = null; // ops-authority steps will be skipped with a clear note
}

// Fresh, unfunded signers — the platform fee-payer covers all fees, so these need no SOL.
const owner = Keypair.generate();
const recipient = Keypair.generate();
const artist = Keypair.generate();
const buyer = Keypair.generate();
const buyer2 = Keypair.generate();
const reviewWallet = Keypair.generate(); // for the restrict/pii demo, so the buyer stays "ok"
const arr = (k: Keypair) => Array.from(k.secretKey);
const songId = `song-${Date.now()}`;
const username = `ada_${Date.now().toString(36)}`;

// ---- tiny http + assert harness --------------------------------------------
type Res = { status: number; json: any; ms: number };
async function http(method: string, path: string, body?: any, headers?: Record<string, string>): Promise<Res> {
  const t0 = Date.now();
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "content-type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json: any;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { status: res.status, json, ms: Date.now() - t0 };
}

type Row = { name: string; ok: boolean; ms: number; note: string };
const rows: Row[] = [];
let pass = 0,
  fail = 0,
  skip = 0;

/** Run one step: `fn` returns a Res; `expect` asserts it (throw or return string to fail). */
async function step(
  name: string,
  fn: () => Promise<Res>,
  expect: (r: Res) => string | void,
): Promise<Res | null> {
  try {
    const r = await fn();
    const problem = expect(r);
    if (problem) {
      fail++;
      rows.push({ name, ok: false, ms: r.ms, note: `${problem} (status ${r.status})` });
      return r;
    }
    pass++;
    rows.push({ name, ok: true, ms: r.ms, note: `${r.status}` });
    return r;
  } catch (e: any) {
    fail++;
    rows.push({ name, ok: false, ms: 0, note: `threw: ${e?.message ?? e}` });
    return null;
  }
}
function skipStep(name: string, why: string) {
  skip++;
  rows.push({ name, ok: true, ms: 0, note: `SKIP — ${why}` });
}

// assertion helpers — the API returns 200 for reads and 201 (Created) for writes
const is200 = (r: Res) => (r.status === 200 || r.status === 201 ? undefined : `expected 2xx`);
const has = (r: Res, k: string) => (r.json && r.json[k] != null ? undefined : `missing "${k}"`);
const sig = (r: Res) => is200(r) || has(r, "signature");

// ---- the flow ---------------------------------------------------------------
async function main() {
  console.log(`API bench → ${BASE}\n`);

  // HEALTH & DISCOVERY
  await step("GET /health", () => http("GET", "/health"), (r) => is200(r) || (r.json?.ok ? undefined : "ok!=true"));
  await step("GET /tokens", () => http("GET", "/tokens"), is200);

  // TOKENS
  await step("POST /mint (100 SBTS → owner)", () => http("POST", "/mint", { to: owner.publicKey.toBase58(), amount: "100" }), sig);
  await step(
    "GET /balances/:owner",
    () => http("GET", `/balances/${owner.publicKey.toBase58()}`),
    (r) => is200(r) || (Array.isArray(r.json) ? undefined : "expected array"),
  );
  const uni = await step(
    "GET /balances/:owner/unified",
    () => http("GET", `/balances/${owner.publicKey.toBase58()}/unified`),
    (r) =>
      is200(r) ||
      (r.json?.quote === "SBTS" ? undefined : "quote!=SBTS") ||
      (r.json?.total ? undefined : "missing total") ||
      (Array.isArray(r.json?.breakdown) && r.json.breakdown.length === 3 ? undefined : "breakdown!=3"),
  );
  if (uni?.json?.rate) console.log(`  ↳ unified total ${uni.json.total} SBTS @ GBP/USD ${uni.json.rate.value} (${uni.json.rate.source})`);
  await step("GET /balances/:owner/SBTS", () => http("GET", `/balances/${owner.publicKey.toBase58()}/SBTS`), is200);

  // transfer SBTS from the owner (who holds the minted 100) → recipient, owner signs via fromSecret
  await step(
    "POST /transfer (10 SBTS owner→recipient)",
    () => http("POST", "/transfer", { to: recipient.publicKey.toBase58(), symbol: "SBTS", amount: "10", fromSecret: arr(owner) }),
    sig,
  );
  // USDC/USDT treasury transfers need the treasury pre-funded (external mint) — check + skip if 0
  for (const sym of ["USDC", "USDT"] as const) {
    const bal = await http("GET", `/balances/${admin.publicKey.toBase58()}/${sym}`);
    const amount = Number(bal.json?.amount ?? bal.json?.uiAmount ?? 0);
    if (bal.status === 200 && amount >= 5) {
      await step(`POST /transfer (5 ${sym} treasury→recipient)`, () => http("POST", "/transfer", { to: recipient.publicKey.toBase58(), symbol: sym, amount: "5" }), sig);
    } else {
      skipStep(`POST /transfer (5 ${sym})`, `treasury ${sym} balance ${amount} < 5 (mint test ${sym} to admin to enable)`);
    }
  }

  // HISTORY
  await step("GET /history/:owner", () => http("GET", `/history/${owner.publicKey.toBase58()}?limit=20`), is200);
  await step("GET /history/:owner/SBTS", () => http("GET", `/history/${owner.publicKey.toBase58()}/SBTS?limit=20`), is200);

  // ADMIN TOKEN FREEZE
  await step("POST /admin/freeze (SBTS owner)", () => http("POST", "/admin/freeze", { owner: owner.publicKey.toBase58(), symbol: "SBTS" }), sig);
  await step("POST /admin/thaw (SBTS owner)", () => http("POST", "/admin/thaw", { owner: owner.publicKey.toBase58(), symbol: "SBTS" }), sig);
  await step(
    "POST /admin/freeze (USDC → expect 400)",
    () => http("POST", "/admin/freeze", { owner: owner.publicKey.toBase58(), symbol: "USDC" }),
    (r) => (r.status === 400 ? undefined : `expected 400, got ${r.status}`),
  );

  // Fund the ephemeral signers so they can pay on-chain rent. create_listing/buy_shares make the
  // artist/buyer the rent payer (no payerSecret override), so unlike a custodial relayer these
  // wallets need a little SOL. Mirrors what the backend must do at signup in production.
  try {
    const conn = new Connection(process.env.SOLANA_RPC_URL ?? "http://127.0.0.1:8899", "confirmed");
    const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash("confirmed");
    const tx = new Transaction({ feePayer: admin.publicKey, blockhash, lastValidBlockHeight });
    for (const k of [artist, buyer, buyer2])
      tx.add(SystemProgram.transfer({ fromPubkey: admin.publicKey, toPubkey: k.publicKey, lamports: Math.floor(0.03 * LAMPORTS_PER_SOL) }));
    tx.sign(admin);
    const t0 = Date.now();
    const s = await conn.sendRawTransaction(tx.serialize());
    // Poll status instead of signatureSubscribe (some RPCs, e.g. Alchemy HTTP, don't serve ws subs).
    let done = false;
    for (let i = 0; i < 30 && !done; i++) {
      const st = (await conn.getSignatureStatuses([s])).value[0];
      if (st && (st.confirmationStatus === "confirmed" || st.confirmationStatus === "finalized")) done = true;
      else await new Promise((r) => setTimeout(r, 1000));
    }
    if (!done) throw new Error("funding tx not confirmed in 30s");
    rows.push({ name: "fund artist/buyer/buyer2 (0.03 SOL each)", ok: true, ms: Date.now() - t0, note: s.slice(0, 8) });
    pass++;
  } catch (e: any) {
    rows.push({ name: "fund artist/buyer/buyer2", ok: false, ms: 0, note: `threw: ${e?.message ?? e}` });
    fail++;
  }

  // ROYALTIES — lifecycle
  const init = await http("POST", "/royalties/init", deployerSecret
    ? { secret: deployerSecret, complianceAuthority: admin.publicKey.toBase58(), treasury: admin.publicKey.toBase58(), platformFeeBps: 200, maxGlobalOwnershipBps: 10000 }
    : {});
  if (!deployerSecret) {
    skipStep("POST /royalties/init", "no deployer key (set DEPLOYER_SECRET or ~/.config/solana/id.json)");
  } else if (init.status === 200) {
    pass++; rows.push({ name: "POST /royalties/init", ok: true, ms: init.ms, note: "200 (initialized)" });
  } else {
    // already initialized is fine — confirm config is readable
    const cfg = await http("GET", "/royalties/config");
    if (cfg.status === 200) { pass++; rows.push({ name: "POST /royalties/init", ok: true, ms: init.ms, note: "already initialized" }); }
    else { fail++; rows.push({ name: "POST /royalties/init", ok: false, ms: init.ms, note: `init ${init.status} and config ${cfg.status}` }); }
  }
  await step("GET /royalties/config", () => http("GET", "/royalties/config"), is200);

  // identity: buyer + buyer2 = ok (needed for buy/receive); reviewWallet used for restrict demo
  const idBody = (u: Keypair, extra: any = {}) => ({
    secret: adminSecret, user: u.publicKey.toBase58(), kycLevel: 2, jurisdiction: "GB", accredited: true, status: "ok",
    pii: { firstName: "Ada", lastName: "Lovelace", dob: "1815-12-10", postcode: "SW1A 1AA" }, ...extra,
  });
  await step("POST /royalties/identity (buyer=ok)", () => http("POST", "/royalties/identity", idBody(buyer)), (r) => sig(r) || has(r, "salt"));
  await step("POST /royalties/identity (buyer2=ok)", () => http("POST", "/royalties/identity", idBody(buyer2)), sig);
  await step("GET /royalties/identity/:user", () => http("GET", `/royalties/identity/${buyer.publicKey.toBase58()}`), (r) => is200(r) || has(r, "piiCommitment"));
  await step("POST /royalties/identity (reviewWallet=restricted)", () => http("POST", "/royalties/identity", idBody(reviewWallet, { status: "restricted" })), sig);
  await step("POST /royalties/pii (recommit reviewWallet)", () => http("POST", "/royalties/pii", { secret: adminSecret, user: reviewWallet.publicKey.toBase58(), pii: { firstName: "Ada", lastName: "Byron", dob: "1815-12-10", postcode: "SW1A 1AA" } }), (r) => sig(r) || has(r, "salt"));

  // profiles
  await step("POST /royalties/profile (artist)", () => http("POST", "/royalties/profile", { secret: arr(artist), role: "artist", payerSecret: adminSecret }), sig);
  await step("POST /royalties/profile (buyer=investor)", () => http("POST", "/royalties/profile", { secret: arr(buyer), role: "investor", payerSecret: adminSecret }), sig);
  await step("GET /royalties/profile/:user", () => http("GET", `/royalties/profile/${buyer.publicKey.toBase58()}`), is200);

  // username
  await step("POST /royalties/username (claim)", () => http("POST", "/royalties/username", { secret: arr(buyer), username, payerSecret: adminSecret }), sig);
  await step("GET /royalties/username/:name", () => http("GET", `/royalties/username/${username}`), (r) => (r.json?.owner === buyer.publicKey.toBase58() ? undefined : "owner mismatch"));
  await step("POST /royalties/username/release", () => http("POST", "/royalties/username/release", { secret: arr(buyer), username }), sig);
  await step("POST /royalties/profile/role (buyer→both)", () => http("POST", "/royalties/profile/role", { secret: arr(buyer), role: "both" }), sig);

  // listing (capture listing + shareMint)
  const listingRes = await step(
    "POST /royalties/listings (create)",
    () => http("POST", "/royalties/listings", { secret: arr(artist), songId, metadataUri: "https://cdn.stradebase.xyz/song.json", totalShares: 1000, pricePerShare: 1000000000, lockupSeconds: 0, requiresAccredited: false, allowedJurisdictions: [], maxSharesPerWallet: 0 }),
    (r) => sig(r) || has(r, "listing") || has(r, "shareMint"),
  );
  const listing = listingRes?.json?.listing as string | undefined;
  const shareMint = listingRes?.json?.shareMint as string | undefined;
  await step("GET /royalties/listings", () => http("GET", "/royalties/listings"), (r) => is200(r) || (Array.isArray(r.json) ? undefined : "expected array"));

  if (!listing || !shareMint) {
    console.log("\n⚠ create-listing failed — skipping listing-scoped steps.\n");
  } else {
    await step("POST /royalties/hook-metas", () => http("POST", "/royalties/hook-metas", { secret: adminSecret, shareMint }), sig);
    await step("POST /royalties/buy (10 shares)", () => http("POST", "/royalties/buy", { secret: arr(buyer), listing, shares: 10, settlementAmount: 10000000000 }), (r) => sig(r));
    await step("GET /royalties/positions/:mint/:owner", () => http("GET", `/royalties/positions/${shareMint}/${buyer.publicKey.toBase58()}`), is200);
    if (deployerSecret)
      await step("POST /royalties/distribute", () => http("POST", "/royalties/distribute", { secret: deployerSecret, listing, totalAmount: 10000000000, reference: "batch-test" }), (r) => sig(r) || has(r, "index"));
    else skipStep("POST /royalties/distribute", "no ops/deployer key");
    await step("GET /royalties/distributions/:listing", () => http("GET", `/royalties/distributions/${listing}`), is200);
    await step("POST /royalties/transfer (secondary 3 → buyer2)", () => http("POST", "/royalties/transfer", { secret: arr(buyer), listing, buyer: buyer2.publicKey.toBase58(), shares: 3, settlementAmount: 3000000 }), (r) => sig(r));
    await step(
      "GET /royalties/trades/:listing (>=2)",
      () => http("GET", `/royalties/trades/${listing}`),
      (r) => is200(r) || (Array.isArray(r.json) && r.json.length >= 2 ? undefined : `expected >=2 trades, got ${Array.isArray(r.json) ? r.json.length : "?"}`),
    );
    await step(
      "GET /royalties/reconcile/:listing (0 unrecorded)",
      () => http("GET", `/royalties/reconcile/${listing}`),
      (r) => is200(r) || (Array.isArray(r.json?.unrecorded) && r.json.unrecorded.length === 0 ? undefined : `unrecorded=${r.json?.unrecorded?.length}`),
    );

    // ROYALTY ADMIN / COMPLIANCE
    await step("POST /royalties/admin/block", () => http("POST", "/royalties/admin/block", { secret: adminSecret, shareMint, user: recipient.publicKey.toBase58() }), sig);
    await step("POST /royalties/admin/unblock", () => http("POST", "/royalties/admin/unblock", { secret: adminSecret, shareMint, user: recipient.publicKey.toBase58() }), sig);
    await step("POST /royalties/admin/compliance (cap 50)", () => http("POST", "/royalties/admin/compliance", { secret: adminSecret, shareMint, maxSharesPerWallet: 50 }), sig);
    if (deployerSecret) {
      await step("POST /royalties/admin/listing-status (paused)", () => http("POST", "/royalties/admin/listing-status", { secret: deployerSecret, listing, status: "paused" }), sig);
      await step("POST /royalties/admin/listing-status (active)", () => http("POST", "/royalties/admin/listing-status", { secret: deployerSecret, listing, status: "active" }), sig);
    } else skipStep("POST /royalties/admin/listing-status", "no ops key");
  }

  // global ops (restore state after)
  if (deployerSecret) {
    await step("POST /royalties/admin/pause (true)", () => http("POST", "/royalties/admin/pause", { secret: deployerSecret, paused: true }), sig);
    await step("POST /royalties/admin/pause (false — restore)", () => http("POST", "/royalties/admin/pause", { secret: deployerSecret, paused: false }), sig);
    await step("POST /royalties/admin/fee (250 bps)", () => http("POST", "/royalties/admin/fee", { secret: deployerSecret, platformFeeBps: 250 }), (r) => sig(r));
  } else {
    skipStep("POST /royalties/admin/pause", "no ops key");
    skipStep("POST /royalties/admin/fee", "no ops key");
  }

  // ---- report --------------------------------------------------------------
  const times = rows.filter((r) => r.ms > 0).map((r) => r.ms).sort((a, b) => a - b);
  const pct = (p: number) => (times.length ? times[Math.min(times.length - 1, Math.floor((p / 100) * times.length))] : 0);
  console.log("\n" + "─".repeat(78));
  for (const r of rows) console.log(`${r.ok ? "✓" : "✗"} ${r.name.padEnd(46)} ${String(r.ms + "ms").padStart(7)}  ${r.note}`);
  console.log("─".repeat(78));
  console.log(`PASS ${pass}   FAIL ${fail}   SKIP ${skip}   |   latency p50 ${pct(50)}ms  p95 ${pct(95)}ms  max ${times.at(-1) ?? 0}ms`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("bench crashed:", e);
  process.exit(1);
});
