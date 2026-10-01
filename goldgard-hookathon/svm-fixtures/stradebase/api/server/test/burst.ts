/**
 * Burst / load test: fire many concurrent writes at the real HTTP server and assert the service
 * absorbs the spike (no collapse, every tx lands) and that idempotency dedupes retries.
 *
 * Minting the SAME mint is the on-chain worst case — every mint write-locks the SBTS mint account,
 * so they serialize on-chain; the engine's bounded concurrency + fresh-blockhash retry is what
 * keeps them all landing instead of failing under the pile-up. (Transfers between distinct accounts
 * parallelize — see docs/architecture.md.)
 *
 * Run with a local validator on :8899:  pnpm --filter @stradebase/api burst
 */
import assert from "node:assert/strict";
import { Connection, Keypair, LAMPORTS_PER_SOL, type PublicKey } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, createMint, getAccount, getAssociatedTokenAddressSync } from "@solana/spl-token";

const RPC = process.env.SOLANA_RPC_URL ?? "http://127.0.0.1:8899";
const connection = new Connection(RPC, "confirmed");
const ok = (m: string) => console.log(`  ✓ ${m}`);
async function airdrop(pk: PublicKey, sol = 100) {
  await connection.confirmTransaction(await connection.requestAirdrop(pk, sol * LAMPORTS_PER_SOL), "confirmed");
}
const bal = async (mint: PublicKey, owner: PublicKey) =>
  (await getAccount(connection, getAssociatedTokenAddressSync(mint, owner, false, TOKEN_2022_PROGRAM_ID), "confirmed", TOKEN_2022_PROGRAM_ID)).amount.toString();
// UI amount → SBTS base units (9 decimals) as a string
const units = (ui: number) => (BigInt(ui) * 1_000_000_000n).toString();

async function main() {
  console.log(`Burst test against ${RPC}`);
  const admin = Keypair.generate();
  await airdrop(admin.publicKey);
  const sbtsMint = await createMint(connection, admin, admin.publicKey, admin.publicKey, 9, undefined, undefined, TOKEN_2022_PROGRAM_ID);

  // A pool of 4 fee payers — the point of the exercise.
  const payers = Array.from({ length: 4 }, () => Keypair.generate());
  await Promise.all(payers.map((p) => airdrop(p.publicKey)));

  process.env.SOLANA_RPC_URL = RPC;
  process.env.CLUSTER = "devnet";
  process.env.SBTS_MINT = sbtsMint.toBase58();
  process.env.SBTS_DECIMALS = "9";
  process.env.USDT_MINT = Keypair.generate().publicKey.toBase58();
  process.env.ADMIN_SECRET_KEY = JSON.stringify([...admin.secretKey]);
  process.env.FEE_PAYER_SECRETS = JSON.stringify(payers.map((p) => [...p.secretKey]));
  process.env.MAX_CONCURRENCY = "12";
  process.env.PRIORITY_FEE_MICROLAMPORTS = "1000";

  const { createApp } = await import("../src/app.js");
  const PORT = 8791;
  const server = createApp().listen(PORT);
  const base = `http://127.0.0.1:${PORT}`;
  const post = (path: string, body: unknown, key?: string) =>
    fetch(base + path, {
      method: "POST",
      headers: { "content-type": "application/json", ...(key ? { "Idempotency-Key": key } : {}) },
      body: JSON.stringify(body),
    });

  try {
    const health = await (await fetch(base + "/health")).json();
    console.log(`  engine: feePayers=${health.engine.feePayers}`);
    assert.equal(health.engine.feePayers, 4, "fee-payer pool loaded");

    // (A) burst of N concurrent mints to distinct recipients
    const N = 40;
    const recipients = Array.from({ length: N }, () => Keypair.generate().publicKey);
    const t0 = Date.now();
    const responses = await Promise.all(recipients.map((r) => post("/mint", { to: r.toBase58(), amount: "10" })));
    const okCount = responses.filter((r) => r.status === 201).length;
    const dt = Date.now() - t0;
    console.log(`  ${okCount}/${N} concurrent mints landed in ${dt}ms (${(N / (dt / 1000)).toFixed(1)} tx/s)`);
    assert.equal(okCount, N, "every mint in the burst succeeded");
    for (const r of recipients.slice(0, 5)) assert.equal(await bal(sbtsMint, r), units(10));
    ok("burst: all mints landed, balances correct (no collapse)");

    // (B) idempotency — two concurrent identical requests with the same key → one on-chain effect
    const idr = Keypair.generate().publicKey;
    const [a, b] = await Promise.all([
      post("/mint", { to: idr.toBase58(), amount: "25" }, "dup-key-1"),
      post("/mint", { to: idr.toBase58(), amount: "25" }, "dup-key-1"),
    ]);
    const [ja, jb] = await Promise.all([a.json(), b.json()]);
    assert.equal(ja.signature, jb.signature, "same signature returned for the duplicate");
    assert.equal(await bal(sbtsMint, idr), units(25), "only one mint actually happened");
    ok("idempotency: duplicate request → single on-chain mint");

    // (C) sale pattern: pre-mint the pool once, then distribute via pooled parallel transfers
    const pf = await post("/distribute/prefund", { amountEach: "1000" });
    assert.equal(pf.status, 201, "prefund ok");
    const drecipients = Array.from({ length: 40 }, () => Keypair.generate().publicKey);
    const t1 = Date.now();
    const dresp = await post("/distribute", { recipients: drecipients.map((r) => ({ to: r.toBase58(), amount: "5" })) });
    const dj = await dresp.json();
    console.log(`  distribute: ${dj.succeeded}/${dj.total} pooled transfers landed in ${Date.now() - t1}ms`);
    assert.equal(dj.succeeded, 40, "every pooled transfer landed");
    for (const r of drecipients.slice(0, 5)) assert.equal(await bal(sbtsMint, r), units(5));
    ok("distribution: pre-mint + pooled transfers (parallel path for a sale)");

    console.log("\nBURST TEST PASSED");
  } finally {
    server.close();
  }
}

main().then(() => process.exit(0)).catch((e) => {
  console.error("\nBURST TEST FAILED:", e);
  process.exit(1);
});
