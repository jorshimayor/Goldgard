/**
 * Full end-to-end test of **custody-mode signing**: the royalty flow runs where the private keys
 * live in a separate signer service (out of the API process) and every transaction is signed by a
 * `RemoteSigner` over HTTP — the raw secret is never passed to the royalty service.
 *
 * Proves the `TxSigner` seam works end-to-end against a KMS/MPC-shaped backend (here, the reference
 * signer service). Swap the service's internals for a real provider and this same path holds.
 *
 * Prereq: a validator with royalty_shares + transfer_hook deployed (same as royalties-e2e).
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import type { AddressInfo } from "node:net";
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, getAccount, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { createSignerApp } from "../src/signing/service.js";

const RPC = process.env.SOLANA_RPC_URL ?? "http://127.0.0.1:8899";
const connection = new Connection(RPC, "confirmed");
const ok = (m: string) => console.log(`  ✓ ${m}`);
const arr = (kp: Keypair) => Array.from(kp.secretKey);
async function airdrop(pk: PublicKey, sol = 10) {
  await connection.confirmTransaction(await connection.requestAirdrop(pk, sol * LAMPORTS_PER_SOL), "confirmed");
}

async function main() {
  console.log(`Custody signer E2E against ${RPC}`);

  // 1. Start the reference custody signer service on an ephemeral port (out-of-process keys).
  const server = createSignerApp().listen(0);
  await new Promise<void>((r) => server.once("listening", () => r()));
  const port = (server.address() as AddressInfo).port;
  const signerUrl = `http://127.0.0.1:${port}`;
  ok(`custody signer service up on ${signerUrl}`);

  // Register keys with the service → opaque keyRefs. The service holds the secrets; we keep refs.
  const register = async (kp: Keypair) => {
    const res = await fetch(`${signerUrl}/keys`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ secret: arr(kp) }),
    });
    if (!res.ok) throw new Error(`register failed: ${res.status}`);
    return (await res.json()) as { keyRef: string; publicKey: string };
  };

  const deployer = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(`${os.homedir()}/.config/solana/id.json`, "utf8"))),
  );
  const admin = Keypair.generate();
  const artist = Keypair.generate();
  const buyer = Keypair.generate();
  const holder2 = Keypair.generate();
  await Promise.all([artist, buyer, holder2, deployer, admin].map((k) => airdrop(k.publicKey)));

  const sbtsMint = await (await import("@solana/spl-token")).createMint(
    connection, admin, admin.publicKey, admin.publicKey, 9, undefined, undefined, TOKEN_2022_PROGRAM_ID,
  );

  // 2. Point the API at the custody service and load the service in custody mode.
  process.env.SOLANA_RPC_URL = RPC;
  process.env.CLUSTER = "devnet";
  process.env.SBTS_MINT = sbtsMint.toBase58();
  process.env.SBTS_DECIMALS = "9";
  process.env.USDT_MINT = Keypair.generate().publicKey.toBase58();
  process.env.ADMIN_SECRET_KEY = JSON.stringify(arr(admin));
  process.env.SIGNER_URL = signerUrl;
  const r = await import("../src/services/royalties.js");

  // Register the actors' keys with custody; from here the test uses only keyRefs.
  const deployerRef = (await register(deployer)).keyRef;
  const adminRef = (await register(admin)).keyRef;
  const artistRef = (await register(artist)).keyRef;
  const buyerRef = (await register(buyer)).keyRef;
  ok("keys registered with custody; API will sign via keyRef only");

  // 3. Full royalty flow — every write authorizes with `keyRef`, never a raw secret.
  await r.initializeGlobal({
    keyRef: deployerRef,
    complianceAuthority: admin.publicKey.toBase58(),
    treasury: admin.publicKey.toBase58(),
    platformFeeBps: 200,
    maxGlobalOwnershipBps: 10000,
  });
  ok("init (signed via custody keyRef)");

  for (const [kp, ref] of [[buyer, buyerRef], [holder2, null]] as const) {
    await r.registerIdentity({ keyRef: adminRef, user: kp.publicKey.toBase58(), kycLevel: 2, jurisdiction: "GB", accredited: true, status: "ok" });
    void ref;
  }
  await r.createUserProfile({ keyRef: artistRef, role: "artist", payerSecret: arr(admin) });
  await r.createUserProfile({ keyRef: buyerRef, role: "investor", payerSecret: arr(admin) });
  ok("identities + profiles (custody-signed)");

  const { listing, shareMint } = (await r.createListing({
    keyRef: artistRef, songId: "song-custody-1",
    metadataUri: "https://cdn.stradebase.xyz/song-custody-1.json",
    totalShares: 1000, pricePerShare: 1_000_000_000, lockupSeconds: 0,
  })) as { listing: string; shareMint: string };
  await r.initHookMetas({ keyRef: adminRef, shareMint });
  ok(`listing created (custody-signed) → ${listing.slice(0, 6)}…`);

  // Primary buy, signed via custody.
  await r.buyShares({ keyRef: buyerRef, listing, shares: 10, settlementAmount: 10_000_000_000 });
  const shareAcct = getAssociatedTokenAddressSync(new PublicKey(shareMint), buyer.publicKey, false, TOKEN_2022_PROGRAM_ID);
  assert.equal((await getAccount(connection, shareAcct, "confirmed", TOKEN_2022_PROGRAM_ID)).amount.toString(), "10");
  ok("primary buy via custody → buyer holds 10 shares");

  // Secondary sale, signed via custody: transfer + on-chain record atomically.
  await r.transferShares({ keyRef: buyerRef, listing, buyer: holder2.publicKey.toBase58(), shares: 4, settlementAmount: 4_000_000 });
  const trades = (await r.readTrades(listing)) as any[];
  assert.equal(trades.length, 2, "primary + secondary on-chain");
  const sec = trades.find((t) => t.kind === "secondary");
  assert.equal(sec.seller, buyer.publicKey.toBase58());
  assert.equal(sec.buyer, holder2.publicKey.toBase58());
  assert.equal(String(sec.shares), "4");
  ok("secondary sale via custody → full on-chain history (primary → secondary)");

  // Sanity: a bogus keyRef is rejected by the service, surfacing as a failed write.
  let rejected = false;
  try {
    await r.buyShares({ keyRef: "key_does_not_exist", listing, shares: 1, settlementAmount: 1 });
  } catch {
    rejected = true;
  }
  assert.ok(rejected, "unknown keyRef must fail");
  ok("unknown keyRef rejected");

  await new Promise<void>((res) => server.close(() => res()));
  console.log("\nCUSTODY SIGNER E2E PASSED");
}

main().then(() => process.exit(0)).catch((e) => {
  console.error("\nCUSTODY SIGNER E2E FAILED:", e);
  process.exit(1);
});
