/**
 * End-to-end test of the royalty HTTP service against DEPLOYED programs.
 *
 * Prereq: a validator with royalty_shares + transfer_hook deployed (upgradeable) and the
 * anchor deployer wallet (~/.config/solana/id.json) as their upgrade authority — the
 * orchestration script handles `anchor deploy`. This drives the same functions the
 * /royalties/* endpoints call:
 *   init global → register identity → create listing → buy → deposit → claim → reads.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import { verify } from "../src/services/pii.js";
import os from "node:os";
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  createMint,
  getAccount,
  getAssociatedTokenAddressSync,
  getOrCreateAssociatedTokenAccount,
  mintTo,
} from "@solana/spl-token";

const RPC = process.env.SOLANA_RPC_URL ?? "http://127.0.0.1:8899";
const connection = new Connection(RPC, "confirmed");
const ok = (m: string) => console.log(`  ✓ ${m}`);
const arr = (kp: Keypair) => Array.from(kp.secretKey);
async function airdrop(pk: PublicKey, sol = 10) {
  await connection.confirmTransaction(await connection.requestAirdrop(pk, sol * LAMPORTS_PER_SOL), "confirmed");
}

async function main() {
  console.log(`Royalty HTTP E2E against ${RPC}`);
  // The deployed programs' upgrade authority = the anchor deployer wallet.
  const deployer = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(`${os.homedir()}/.config/solana/id.json`, "utf8"))),
  );
  const admin = Keypair.generate(); // compliance authority + SBTS mint authority + treasury
  const artist = Keypair.generate();
  const buyer = Keypair.generate();
  await Promise.all([airdrop(admin.publicKey), airdrop(artist.publicKey), airdrop(buyer.publicKey)]);
  await airdrop(deployer.publicKey);

  // SBTS: the GBP Token-2022 stablecoin (admin holds mint + freeze authority).
  const sbtsMint = await createMint(connection, admin, admin.publicKey, admin.publicKey, 9, undefined, undefined, TOKEN_2022_PROGRAM_ID);

  process.env.SOLANA_RPC_URL = RPC;
  process.env.CLUSTER = "devnet";
  process.env.SBTS_MINT = sbtsMint.toBase58();
  process.env.SBTS_DECIMALS = "9";
  process.env.USDT_MINT = Keypair.generate().publicKey.toBase58(); // registry needs it on devnet
  process.env.ADMIN_SECRET_KEY = JSON.stringify(arr(admin));
  const r = await import("../src/services/royalties.js");

  // Fund SBTS to buyer (to pay) and artist (to deposit royalties).
  const buyerSbst = await getOrCreateAssociatedTokenAccount(connection, admin, sbtsMint, buyer.publicKey, false, undefined, undefined, TOKEN_2022_PROGRAM_ID);
  const artistSbst = await getOrCreateAssociatedTokenAccount(connection, admin, sbtsMint, artist.publicKey, false, undefined, undefined, TOKEN_2022_PROGRAM_ID);
  await mintTo(connection, admin, sbtsMint, buyerSbst.address, admin, 1_000_000_000_000, [], undefined, TOKEN_2022_PROGRAM_ID); // 1000
  await mintTo(connection, admin, sbtsMint, artistSbst.address, admin, 10_000_000_000, [], undefined, TOKEN_2022_PROGRAM_ID); //   10
  ok("SBTS minted to buyer (1000) + artist (10)");

  await r.initializeGlobal({
    secret: arr(deployer),
    complianceAuthority: admin.publicKey.toBase58(),
    treasury: admin.publicKey.toBase58(),
    platformFeeBps: 200,
    maxGlobalOwnershipBps: 10000,
  });
  ok("POST /royalties/init");

  // The full PII record is hashed here; only the 32-byte commitment reaches the chain.
  const pii = { firstName: "Ada", lastName: "Lovelace", dob: "1815-12-10", postcode: "SW1A 1AA" };
  const idRes = (await r.registerIdentity({
    secret: arr(admin), user: buyer.publicKey.toBase58(), kycLevel: 2,
    jurisdiction: "GB", accredited: true, status: "ok", pii,
  })) as any;
  assert.ok(idRes.salt, "registerIdentity must return the salt exactly once");
  ok("POST /royalties/identity (+ salted PII commitment)");

  // Platform profiles gate listing creation (Artist/Both) and carry the trade counters.
  await r.createUserProfile({ secret: arr(artist), role: "artist", payerSecret: arr(admin) });
  await r.createUserProfile({ secret: arr(buyer), role: "investor", payerSecret: arr(admin) });
  ok("POST /royalties/profile ×2 (artist + investor)");

  const { listing, shareMint } = (await r.createListing({
    secret: arr(artist),
    songId: "song-http-1",
    metadataUri: "https://cdn.stradebase.xyz/song-http-1.json",
    totalShares: 1000,
    pricePerShare: 1_000_000_000, // 1 SBTS/share
    lockupSeconds: 0,
  })) as { listing: string; shareMint: string };
  ok(`POST /royalties/listings → ${listing.slice(0, 6)}…`);

  // The program moves no money: the buyer's SBTS balance must be UNCHANGED by a purchase.
  // Payment is settled off-chain; `settlementAmount` is recorded on the trade as data.
  const buyerSbstBefore = BigInt((await getAccount(connection, buyerSbst.address, "confirmed", TOKEN_2022_PROGRAM_ID)).amount.toString());
  await r.buyShares({ secret: arr(buyer), listing, shares: 10, settlementAmount: 10_000_000_000 });
  const shareAcct = getAssociatedTokenAddressSync(new PublicKey(shareMint), buyer.publicKey, false, TOKEN_2022_PROGRAM_ID);
  assert.equal((await getAccount(connection, shareAcct, "confirmed", TOKEN_2022_PROGRAM_ID)).amount.toString(), "10");
  const buyerSbstAfter = BigInt((await getAccount(connection, buyerSbst.address, "confirmed", TOKEN_2022_PROGRAM_ID)).amount.toString());
  assert.equal(buyerSbstBefore.toString(), buyerSbstAfter.toString(), "buy must not move any SBTS on-chain");
  ok("POST /royalties/buy → buyer holds 10 shares, SBTS balance unchanged");

  // Royalty payout is recorded, not moved: the ledger figure advances, no vault exists.
  const dist = (await r.recordDistribution({
    secret: arr(deployer), listing, totalAmount: 10_000_000_000, reference: "batch-2026-07",
  })) as any;
  assert.equal(dist.index, "0");
  const distributions = (await r.readDistributions(listing)) as any[];
  assert.equal(distributions.length, 1);
  assert.equal(distributions[0].totalAmount, "10000000000");
  ok("POST /royalties/distribute → recorded (no funds moved)");

  const cfg = (await r.readConfig()) as any;
  assert.equal(cfg.sbstMint, sbtsMint.toBase58());
  const l = (await r.readListing(listing)) as any;
  assert.equal(l.sharesMinted, "10");
  ok("GET /royalties/config + /royalties/listings/:listing");

  const artistProfile = (await r.readProfile(artist.publicKey.toBase58())) as any;
  const buyerProfile = (await r.readProfile(buyer.publicKey.toBase58())) as any;
  assert.equal(artistProfile.listingsCreated, "1");
  assert.equal(buyerProfile.tradesCount, "1");
  assert.deepEqual(artistProfile.role, { artist: {} });
  ok("GET /royalties/profile/:user → counters tracked");

  // Identity layer: public handle on-chain, PII verifiable only with the off-chain salt.
  await r.claimUsername({ secret: arr(buyer), username: "ada_l", payerSecret: arr(admin) });
  const claimed = (await r.readUsername("ada_l")) as any;
  assert.equal(claimed.owner, buyer.publicKey.toBase58());
  assert.equal((await r.readProfile(buyer.publicKey.toBase58()) as any).username, "ada_l");
  assert.equal(await r.readUsername("nobody_here"), null);
  ok("POST /royalties/username → claimed + resolvable");

  const identity = (await r.readIdentity(buyer.publicKey.toBase58())) as any;
  assert.ok(
    verify(pii, Buffer.from(idRes.salt, "base64"), Buffer.from(identity.piiCommitment)),
    "on-chain commitment must re-derive from the stored record + salt",
  );
  assert.ok(!verify({ ...pii, lastName: "Byron" }, Buffer.from(idRes.salt, "base64"), Buffer.from(identity.piiCommitment)));
  assert.equal(identity.piiVersion, 1);
  assert.deepEqual(identity.status, { ok: {} });
  ok("PII commitment verifies against the record, and a tampered record does not");

  // Secondary sale: buyer resells 3 shares to a new KYC'd holder. Transfer + on-chain record
  // land atomically; the ledger then holds the full history from primary → secondary.
  const holder2 = Keypair.generate();
  await airdrop(holder2.publicKey);
  await r.registerIdentity({ secret: arr(admin), user: holder2.publicKey.toBase58(), kycLevel: 2, jurisdiction: "GB", accredited: true, status: "ok" });
  await r.initHookMetas({ secret: arr(admin), shareMint }); // resolver needed for secondary transfers
  await r.transferShares({ secret: arr(buyer), listing, buyer: holder2.publicKey.toBase58(), shares: 3, settlementAmount: 3_000_000 });
  const trades = (await r.readTrades(listing)) as any[];
  assert.equal(trades.length, 2, "on-chain ledger has primary + secondary");
  const sec = trades.find((t) => t.kind === "secondary");
  assert.equal(sec.seller, buyer.publicKey.toBase58());
  assert.equal(sec.buyer, holder2.publicKey.toBase58());
  assert.equal(String(sec.shares), "3");
  ok("POST /royalties/transfer → secondary recorded on-chain; /trades shows primary→secondary");

  await r.updatePlatformFee({ secret: arr(deployer), platformFeeBps: 250 });
  assert.equal(((await r.readConfig()) as any).platformFeeBps, 250);
  ok("POST /royalties/admin/fee → 250 bps");

  console.log("\nROYALTY HTTP E2E PASSED");
}

main().then(() => process.exit(0)).catch((e) => {
  console.error("\nROYALTY E2E FAILED:", e);
  process.exit(1);
});
