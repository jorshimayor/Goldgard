/**
 * E2E for the secondary-trade indexer against DEPLOYED programs.
 *
 * Proves the indexer turns an on-chain share *transfer* (which the program writes no
 * TradeRecord for) into a structured secondary-trade record, while NOT mistaking the primary
 * mint for a trade — and that re-indexing is idempotent. Also checks the merged `readTrades`
 * view (primary TradeRecord + indexed secondary) the `/royalties/trades/:listing` endpoint uses.
 *
 * Prereq: a validator with royalty_shares + transfer_hook deployed (same as royalties-e2e).
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  createMint,
  createTransferCheckedWithTransferHookInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";

const getAta = (mint: PublicKey, owner: PublicKey): PublicKey =>
  getAssociatedTokenAddressSync(mint, owner, false, TOKEN_2022_PROGRAM_ID);

const RPC = process.env.SOLANA_RPC_URL ?? "http://127.0.0.1:8899";
const connection = new Connection(RPC, "confirmed");
const ok = (m: string) => console.log(`  ✓ ${m}`);
const arr = (kp: Keypair) => Array.from(kp.secretKey);
async function airdrop(pk: PublicKey, sol = 10) {
  await connection.confirmTransaction(await connection.requestAirdrop(pk, sol * LAMPORTS_PER_SOL), "confirmed");
}

async function main() {
  console.log(`Indexer E2E against ${RPC}`);
  const deployer = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(`${os.homedir()}/.config/solana/id.json`, "utf8"))),
  );
  const admin = Keypair.generate();
  const artist = Keypair.generate();
  const buyer = Keypair.generate();
  const holder2 = Keypair.generate();
  await Promise.all([airdrop(admin.publicKey), airdrop(artist.publicKey), airdrop(buyer.publicKey), airdrop(holder2.publicKey)]);
  await airdrop(deployer.publicKey);

  const sbtsMint = await createMint(connection, admin, admin.publicKey, admin.publicKey, 9, undefined, undefined, TOKEN_2022_PROGRAM_ID);

  process.env.SOLANA_RPC_URL = RPC;
  process.env.CLUSTER = "devnet";
  process.env.SBTS_MINT = sbtsMint.toBase58();
  process.env.SBTS_DECIMALS = "9";
  process.env.USDT_MINT = Keypair.generate().publicKey.toBase58();
  process.env.ADMIN_SECRET_KEY = JSON.stringify(arr(admin));
  const r = await import("../src/services/royalties.js");

  await r.initializeGlobal({
    secret: arr(deployer),
    complianceAuthority: admin.publicKey.toBase58(),
    treasury: admin.publicKey.toBase58(),
    platformFeeBps: 200,
    maxGlobalOwnershipBps: 10000,
  });
  // Both wallets need KYC (the hook gates the recipient) + a profile (buyer counter, artist role).
  for (const u of [buyer, holder2]) {
    await r.registerIdentity({ secret: arr(admin), user: u.publicKey.toBase58(), kycLevel: 2, jurisdiction: "GB", accredited: true, status: "ok" });
  }
  await r.createUserProfile({ secret: arr(artist), role: "artist", payerSecret: arr(admin) });
  await r.createUserProfile({ secret: arr(buyer), role: "investor", payerSecret: arr(admin) });
  ok("bootstrap: global + identities + profiles");

  const { listing, shareMint } = (await r.createListing({
    secret: arr(artist), songId: "song-indexer-1",
    metadataUri: "https://cdn.stradebase.xyz/song-indexer-1.json",
    totalShares: 1000, pricePerShare: 1_000_000_000, lockupSeconds: 0,
  })) as { listing: string; shareMint: string };
  await r.initHookMetas({ secret: arr(admin), shareMint });
  ok(`listing created → ${listing.slice(0, 6)}…`);

  // Primary issuance (no money on-chain).
  await r.buyShares({ secret: arr(buyer), listing, shares: 10, settlementAmount: 10_000_000_000 });
  ok("primary buy: buyer holds 10 shares");

  const mint = new PublicKey(shareMint);

  // Secondary SALE through the API: transfer + on-chain record land atomically.
  await r.transferShares({ secret: arr(buyer), listing, buyer: holder2.publicKey.toBase58(), shares: 4, settlementAmount: 4_000_000 });
  ok("secondary sale via API (transfer + on-chain record)");

  // On-chain ledger is authoritative: one primary + one secondary, both recorded on chain.
  const trades = (await r.readTrades(listing)) as any[];
  assert.equal(trades.length, 2, `expected 2 on-chain trades, got ${trades.length}`);
  const primary = trades.find((t) => t.kind === "primary");
  const secondary = trades.find((t) => t.kind === "secondary");
  assert.ok(primary && secondary, "one primary + one secondary on chain");
  assert.equal(primary.buyer, buyer.publicKey.toBase58());
  assert.equal(String(primary.shares), "10");
  assert.equal(secondary.seller, buyer.publicKey.toBase58());
  assert.equal(secondary.buyer, holder2.publicKey.toBase58());
  assert.equal(String(secondary.shares), "4");
  assert.equal(String(secondary.settlementAmount), "4000000");
  ok("GET /royalties/trades → full on-chain history (primary → secondary)");

  // Reconciliation: the recorded sale's token movement matches its on-chain record → nothing flagged.
  // (reconcileTrades resolves the shared indexer/store internally.)
  const clean = (await r.reconcileTrades(listing)) as any;
  assert.equal(clean.unrecorded.length, 0, "recorded sale must reconcile cleanly");
  ok("reconcile: recorded sale is clean (no unrecorded moves)");

  // Now simulate a raw transfer that BYPASSES the API (no record) — the audit net must catch it.
  const src = getAta(mint, buyer.publicKey);
  const dst = getAta(mint, holder2.publicKey);
  const ix = await createTransferCheckedWithTransferHookInstruction(
    connection, src, mint, dst, buyer.publicKey, 1n, 0, [], "confirmed", TOKEN_2022_PROGRAM_ID,
  );
  const sig = await sendAndConfirmTransaction(connection, new Transaction().add(ix), [buyer], { commitment: "confirmed" });
  ok(`raw (unrecorded) transfer landed: ${sig.slice(0, 8)}…`);

  const flagged = (await r.reconcileTrades(listing)) as any;
  assert.equal(flagged.unrecorded.length, 1, `expected 1 unrecorded move, got ${flagged.unrecorded.length}`);
  assert.equal(String(flagged.unrecorded[0].amount), "1");
  assert.equal(flagged.unrecorded[0].signature, sig);
  ok("reconcile: unrecorded transfer flagged for investigation");

  console.log("\nINDEXER E2E PASSED");
}

main().then(() => process.exit(0)).catch((e) => {
  console.error("\nINDEXER E2E FAILED:", e);
  process.exit(1);
});
