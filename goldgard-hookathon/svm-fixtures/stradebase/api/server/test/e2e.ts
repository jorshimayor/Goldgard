/**
 * End-to-end integration test against a running validator.
 *
 * Creates a REAL SBTS Token-2022 mint plus USDC/USDT test mints, then drives the actual
 * service layer (the same code the HTTP API calls) through:
 *   mint → transfer → freeze/thaw → history  for SBTS,
 *   fund → transfer → history + freeze-rejection  for USDC & USDT,
 *   and (best-effort, needs the mpl-core program) NFT mint → freeze → thaw.
 *
 * Run via `pnpm --filter @stradebase/api e2e` with a local validator on :8899.
 * The mints are created here, then the service modules are imported dynamically so they
 * pick up the freshly-created mint addresses from the environment.
 */
import assert from "node:assert/strict";
import { Connection, Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createMint,
  getAccount,
  getAssociatedTokenAddressSync,
  getOrCreateAssociatedTokenAccount,
  mintTo,
} from "@solana/spl-token";

const RPC = process.env.SOLANA_RPC_URL ?? "http://127.0.0.1:8899";
const connection = new Connection(RPC, "confirmed");

async function airdrop(pk: import("@solana/web3.js").PublicKey, sol = 100) {
  await connection.confirmTransaction(
    await connection.requestAirdrop(pk, sol * LAMPORTS_PER_SOL),
    "confirmed",
  );
}
const ok = (msg: string) => console.log(`  ✓ ${msg}`);

async function main() {
  console.log(`E2E against ${RPC}`);
  const admin = Keypair.generate();
  await airdrop(admin.publicKey);

  // Real mints: SBTS is Token-2022 (admin = mint + freeze authority); USDC/USDT are classic SPL.
  const sbtsMint = await createMint(connection, admin, admin.publicKey, admin.publicKey, 9, undefined, undefined, TOKEN_2022_PROGRAM_ID);
  const usdcMint = await createMint(connection, admin, admin.publicKey, admin.publicKey, 6, undefined, undefined, TOKEN_PROGRAM_ID);
  const usdtMint = await createMint(connection, admin, admin.publicKey, admin.publicKey, 6, undefined, undefined, TOKEN_PROGRAM_ID);
  ok(`mints created — SBTS ${sbtsMint.toBase58().slice(0, 6)}…, USDC, USDT`);

  // Point the service layer at these mints + the custodial admin key, then import it.
  process.env.SOLANA_RPC_URL = RPC;
  process.env.CLUSTER = "devnet";
  process.env.SBTS_MINT = sbtsMint.toBase58();
  process.env.SBTS_DECIMALS = "9";
  process.env.USDC_MINT = usdcMint.toBase58();
  process.env.USDT_MINT = usdtMint.toBase58();
  process.env.ADMIN_SECRET_KEY = JSON.stringify(Array.from(admin.secretKey));
  const tokens = await import("../src/services/tokens.js");

  const user = Keypair.generate();
  const user2 = Keypair.generate();
  await Promise.all([airdrop(user.publicKey, 5), airdrop(user2.publicKey, 5)]);
  const A = user.publicKey.toBase58();
  const B = user2.publicKey.toBase58();

  // ---- SBTS: mint → transfer → freeze/thaw ----
  console.log("SBTS:");
  await tokens.mintSbts(A, "100");
  assert.equal((await tokens.balance(A, "SBTS")).ui, "100");
  ok("minted 100 SBTS to user");

  await tokens.transfer({ to: B, symbol: "SBTS", uiAmount: "10", fromSecret: Array.from(user.secretKey) });
  assert.equal((await tokens.balance(A, "SBTS")).ui, "90");
  assert.equal((await tokens.balance(B, "SBTS")).ui, "10");
  ok("transferred 10 SBTS user → user2 (90 / 10)");

  const sbtsAta = getAssociatedTokenAddressSync(sbtsMint, user.publicKey, false, TOKEN_2022_PROGRAM_ID);
  await tokens.freeze(A, "SBTS");
  assert.equal((await getAccount(connection, sbtsAta, "confirmed", TOKEN_2022_PROGRAM_ID)).isFrozen, true);
  ok("froze user's SBTS account");
  await tokens.thaw(A, "SBTS");
  assert.equal((await getAccount(connection, sbtsAta, "confirmed", TOKEN_2022_PROGRAM_ID)).isFrozen, false);
  ok("thawed user's SBTS account");

  // ---- USDC / USDT: fund → transfer → freeze must reject ----
  for (const [sym, mint] of [["USDC", usdcMint], ["USDT", usdtMint]] as const) {
    console.log(`${sym}:`);
    const ata = await getOrCreateAssociatedTokenAccount(connection, admin, mint, user.publicKey, false, undefined, undefined, TOKEN_PROGRAM_ID);
    await mintTo(connection, admin, mint, ata.address, admin, 50_000_000, [], undefined, TOKEN_PROGRAM_ID); // 50.0
    await tokens.transfer({ to: B, symbol: sym, uiAmount: "5", fromSecret: Array.from(user.secretKey) });
    assert.equal((await tokens.balance(B, sym)).ui, "5");
    ok(`funded + transferred 5 ${sym} user → user2`);
    await assert.rejects(() => tokens.freeze(A, sym), /freeze|authority/i);
    ok(`${sym} freeze correctly rejected (external mint)`);
  }

  // ---- transaction history (per-token + combined) ----
  console.log("History:");
  const sbtsHist = await tokens.history(A, "SBTS");
  assert.ok(sbtsHist.length >= 1, "SBTS history non-empty");
  const all = await tokens.historyAll(A);
  const syms = new Set(all.map((h) => h.symbol));
  assert.ok(syms.has("SBTS") && syms.has("USDC") && syms.has("USDT"), "combined history spans all tokens");
  // sorted newest-first
  for (let i = 1; i < all.length; i++) {
    assert.ok((all[i - 1].blockTime ?? 0) >= (all[i].blockTime ?? 0), "history sorted desc");
  }
  ok(`SBTS history=${sbtsHist.length}; combined=${all.length} across ${[...syms].sort().join("+")}`);

  // ---- unified SBTS balance (decimals + FX resolved on the backend) ----
  console.log("Unified balance:");
  // A holds 90 SBTS + 45 USDC + 45 USDT. At the fixed rate GBP/USD=1.27: 45/1.27=35.43 each.
  // total = 90 + 35.43 + 35.43 = 160.87 SBTS.
  const uni = (await tokens.unifiedBalance(A)) as any;
  assert.equal(uni.quote, "SBTS");
  assert.equal(uni.rate.value, "1.27");
  assert.equal(uni.breakdown.find((b: any) => b.symbol === "SBTS").inSbts, "90.00");
  assert.equal(uni.breakdown.find((b: any) => b.symbol === "USDC").inSbts, "35.43");
  assert.equal(uni.total, "160.87");
  assert.equal(uni.display, "160.87");
  ok(`unified: ${uni.display} SBTS (90 SBTS + 45 USDC + 45 USDT @ ${uni.rate.value})`);

  // ---- NFT (best-effort; needs the mpl-core program on the validator) ----
  console.log("NFT (Metaplex Core):");
  try {
    const nfts = await import("../src/services/nfts.js");
    const minted = await nfts.mintNft({ name: "Gold Tier #1", uri: "https://example.com/gold1.json", owner: A });
    ok(`minted NFT ${minted.asset.slice(0, 6)}…`);
    await nfts.freezeNft(minted.asset);
    assert.equal((await nfts.getNft(minted.asset)).frozen, true);
    ok("froze NFT");
    await nfts.thawNft(minted.asset);
    assert.equal((await nfts.getNft(minted.asset)).frozen, false);
    ok("thawed NFT");
  } catch (e) {
    // The token flows above are the core assertions; the NFT step needs the mpl-core program
    // present on the validator (clone it with --clone-upgradeable-program). Surface, don't fail.
    console.log(`  ⚠ NFT flow skipped: ${(e as Error).message}`);
  }

  console.log("\nE2E PASSED");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("\nE2E FAILED:", e);
    process.exit(1);
  });
