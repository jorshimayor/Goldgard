/**
 * Property-based invariant "fuzz" harness.
 *
 * Runs a randomized (seeded → replayable) sequence of buy / transfer / distribute
 * operations against a fresh listing and, after every operation, asserts the
 * protocol's core economic invariants hold:
 *
 *   INV-SUPPLY       shares_minted <= total_shares
 *   INV-CONSERVATION sum(all holder share balances) == shares_minted
 *   INV-CAP          no holder balance exceeds max_shares_per_wallet
 *   INV-LEDGER       cumulative_royalties == sum(recorded distributions); no money on-chain
 *
 * The program moves no money (payouts happen off-chain), so there is no vault to check for
 * solvency — the ledger invariant replaces the old INV-SOLVENCY.
 *
 * This is not coverage-guided fuzzing (Trident/honggfuzz is Linux-only; see
 * docs/architecture.md for the CI setup). It is a runnable invariant/property harness that
 * exercises many random economic states in-process against a live validator.
 */
import * as anchor from "@anchor-lang/core";
import { Program } from "@anchor-lang/core";
import { RoyaltyShares } from "../target/types/royalty_shares";
import { TransferHook } from "../target/types/transfer_hook";
import {
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createMint,
  createAssociatedTokenAccountIdempotent,
  getAssociatedTokenAddressSync,
  getAccount,
  createTransferCheckedWithTransferHookInstruction,
} from "@solana/spl-token";
import { Keypair, PublicKey, SystemProgram, Transaction, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { assert } from "chai";

// Deterministic PRNG so failures replay from the SEED printed below.
const SEED = 0x9e3779b9;
function mulberry32(a: number) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("fuzz: economic invariants", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const royalty = anchor.workspace.royaltyShares as Program<RoyaltyShares>;
  const hook = anchor.workspace.transferHook as Program<TransferHook>;
  const authority = provider.wallet;
  const payer = (authority as any).payer as Keypair;

  const rng = mulberry32(SEED);
  const randInt = (n: number) => Math.floor(rng() * n);
  const pick = <T>(arr: T[]) => arr[randInt(arr.length)];

  const TOTAL_SHARES = 500;
  const CAP = 60; // per-wallet cap
  const N_HOLDERS = 4;
  const N_OPS = 36;

  const artist = Keypair.generate();
  let treasury: PublicKey; // read from global config (shared across test files)
  const holders: Keypair[] = [];
  let sbstMint: PublicKey;
  let listing: PublicKey;
  let shareMint: PublicKey;
  let compliance: PublicKey;

  // JS mirror of on-chain economic state.
  let mintedShares = 0;
  let cumulativeDistributed = 0n;
  let distributionCount = 0;

  const [globalConfig] = PublicKey.findProgramAddressSync(
    [Buffer.from("global_config")],
    royalty.programId
  );
  const BPF_LOADER_UPGRADEABLE = new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111");
  const [programData] = PublicKey.findProgramAddressSync(
    [royalty.programId.toBuffer()],
    BPF_LOADER_UPGRADEABLE
  );

  const airdrop = async (pk: PublicKey, sol = 20) => {
    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(pk, sol * LAMPORTS_PER_SOL)
    );
  };
  const identityPda = (u: PublicKey) =>
    PublicKey.findProgramAddressSync([Buffer.from("identity"), u.toBuffer()], royalty.programId)[0];
  const userProfilePda = (u: PublicKey) =>
    PublicKey.findProgramAddressSync([Buffer.from("user_profile"), u.toBuffer()], royalty.programId)[0];

  /** Create the platform profile if absent (idempotent). */
  const ensureProfile = async (kp: Keypair, role: "artist" | "investor" | "both") => {
    const pda = userProfilePda(kp.publicKey);
    if (await provider.connection.getAccountInfo(pda)) return;
    await royalty.methods
      .createUserProfile({ [role]: {} } as any)
      .accountsPartial({
        payer: authority.publicKey,
        user: kp.publicKey,
        profile: pda,
        systemProgram: SystemProgram.programId,
      })
      .signers([kp])
      .rpc();
  };
  const positionPda = (owner: PublicKey) =>
    PublicKey.findProgramAddressSync(
      [Buffer.from("position"), shareMint.toBuffer(), owner.toBuffer()],
      royalty.programId
    )[0];
  const shareAta = (owner: PublicKey) =>
    getAssociatedTokenAddressSync(shareMint, owner, false, TOKEN_2022_PROGRAM_ID);
  const distributionPda = (index: number) =>
    PublicKey.findProgramAddressSync(
      [Buffer.from("distribution"), listing.toBuffer(), new anchor.BN(index).toArrayLike(Buffer, "le", 8)],
      royalty.programId
    )[0];

  const shareBal = async (owner: PublicKey): Promise<number> => {
    try {
      const a = await getAccount(provider.connection, shareAta(owner), undefined, TOKEN_2022_PROGRAM_ID);
      return Number(a.amount);
    } catch {
      return 0;
    }
  };

  const ensureGlobal = async () => {
    const info = await provider.connection.getAccountInfo(globalConfig);
    if (info) {
      const cfg = await royalty.account.globalConfig.fetch(globalConfig);
      sbstMint = cfg.sbstMint;
      treasury = cfg.treasury;
      return;
    }
    treasury = Keypair.generate().publicKey;
    sbstMint = await createMint(provider.connection, payer, authority.publicKey, null, 6, undefined, undefined, TOKEN_PROGRAM_ID);
    await royalty.methods
      .initializeGlobal({
        complianceAuthority: authority.publicKey,
        treasury,
        sbstMint,
        platformFeeBps: 200,
        maxGlobalOwnershipBps: 10000,
      })
      .accountsPartial({ authority: authority.publicKey, globalConfig, program: royalty.programId, programData })
      .rpc();
  };

  before(async () => {
    await airdrop(authority.publicKey, 100);
    await airdrop(artist.publicKey);
    await ensureGlobal();

    const songId = Buffer.alloc(32);
    songId.write("fuzz-listing");
    [listing] = PublicKey.findProgramAddressSync([Buffer.from("listing"), artist.publicKey.toBuffer(), songId], royalty.programId);
    [shareMint] = PublicKey.findProgramAddressSync([Buffer.from("share_mint"), listing.toBuffer()], royalty.programId);
    [compliance] = PublicKey.findProgramAddressSync([Buffer.from("compliance"), shareMint.toBuffer()], royalty.programId);

    await ensureProfile(artist, "artist");
    await royalty.methods
      .createListing({
        songId: Array.from(songId),
        metadataUri: "https://cdn.stradebase.xyz/fuzz.json",
        totalShares: new anchor.BN(TOTAL_SHARES),
        pricePerShare: new anchor.BN(1_000),
        royaltyPercentSold: 5000,
        artistRetainedPercent: 5000,
        startTime: new anchor.BN(0),
        endTime: null,
        lockupSeconds: new anchor.BN(0),
        requiresAccredited: false,
        allowedJurisdictions: [],
        maxSharesPerWallet: new anchor.BN(CAP),
      })
      .accountsPartial({
        artist: artist.publicKey,
        artistProfile: userProfilePda(artist.publicKey),
        globalConfig,
        listing,
        shareMint,
        complianceConfig: compliance,
        transferHookProgram: hook.programId,
        token2022Program: TOKEN_2022_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([artist])
      .rpc();

    const [extraMetas] = PublicKey.findProgramAddressSync([Buffer.from("extra-account-metas"), shareMint.toBuffer()], hook.programId);
    await hook.methods
      .initializeExtraAccountMetaList()
      .accountsPartial({ payer: authority.publicKey, extraAccountMetaList: extraMetas, mint: shareMint, systemProgram: SystemProgram.programId })
      .rpc();

    for (let i = 0; i < N_HOLDERS; i++) {
      const kp = Keypair.generate();
      await airdrop(kp.publicKey);
      await royalty.methods
        .registerIdentity({ kycLevel: 2, jurisdiction: [71, 66], status: { ok: {} }, accredited: true, piiCommitment: null })
        .accountsPartial({ complianceAuthority: authority.publicKey, globalConfig, user: kp.publicKey, identity: identityPda(kp.publicKey) })
        .rpc();
      holders.push(kp);
    }
  });

  const doBuy = async (buyer: Keypair, shares: number) => {
    await ensureProfile(buyer, "investor");
    const l = await royalty.account.songListing.fetch(listing);
    const [tradeRecord] = PublicKey.findProgramAddressSync(
      [Buffer.from("trade"), listing.toBuffer(), l.totalTrades.toArrayLike(Buffer, "le", 8)],
      royalty.programId
    );
    await royalty.methods
      .buyShares(new anchor.BN(shares), new anchor.BN(shares * 1_000), Array(64).fill(0))
      .accountsPartial({
        buyer: buyer.publicKey,
        globalConfig,
        listing,
        buyerIdentity: identityPda(buyer.publicKey),
        buyerProfile: userProfilePda(buyer.publicKey),
        complianceConfig: compliance,
        shareMint,
        buyerShareAta: shareAta(buyer.publicKey),
        position: positionPda(buyer.publicKey),
        tradeRecord,
        token2022Program: TOKEN_2022_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([buyer])
      .rpc();
    mintedShares += shares;
  };

  const doTransfer = async (from: Keypair, to: PublicKey, amount: number) => {
    await createAssociatedTokenAccountIdempotent(provider.connection, payer, shareMint, to, {}, TOKEN_2022_PROGRAM_ID);
    const ix = await createTransferCheckedWithTransferHookInstruction(
      provider.connection, shareAta(from.publicKey), shareMint, shareAta(to), from.publicKey,
      BigInt(amount), 0, [], "confirmed", TOKEN_2022_PROGRAM_ID
    );
    await provider.sendAndConfirm(new Transaction().add(ix), [from]);
  };

  const checkInvariants = async () => {
    const l = await royalty.account.songListing.fetch(listing);
    // INV-SUPPLY
    assert.isAtMost(l.sharesMinted.toNumber(), TOTAL_SHARES, "INV-SUPPLY");
    assert.equal(l.sharesMinted.toNumber(), mintedShares, "minted mirror");
    // INV-CONSERVATION + INV-CAP
    let sum = 0;
    for (const h of holders) {
      const b = await shareBal(h.publicKey);
      assert.isAtMost(b, CAP, `INV-CAP holder ${h.publicKey.toBase58().slice(0, 6)}`);
      sum += b;
    }
    assert.equal(sum, mintedShares, "INV-CONSERVATION");
    // INV-LEDGER: recorded royalties match what we distributed; no vault exists to reconcile.
    assert.equal(l.cumulativeRoyalties.toString(), cumulativeDistributed.toString(), "INV-LEDGER");
    assert.equal(l.totalDistributions.toNumber(), distributionCount, "INV-LEDGER count");
  };

  it(`holds invariants across ${N_OPS} randomized ops (seed ${SEED.toString(16)})`, async () => {
    await checkInvariants();

    for (let op = 0; op < N_OPS; op++) {
      const kind = pick(["buy", "buy", "transfer", "transfer", "distribute", "distribute"]);
      try {
        if (kind === "buy") {
          const buyer = pick(holders);
          const held = await shareBal(buyer.publicKey);
          const remainingSupply = TOTAL_SHARES - mintedShares;
          const room = Math.min(CAP - held, remainingSupply);
          if (room <= 0) continue;
          const amount = 1 + randInt(Math.min(room, 25));
          await doBuy(buyer, amount);
        } else if (kind === "transfer") {
          const from = pick(holders);
          const to = pick(holders);
          if (to.publicKey.equals(from.publicKey)) continue;
          const fromBal = await shareBal(from.publicKey);
          const toBal = await shareBal(to.publicKey);
          const room = Math.min(fromBal, CAP - toBal);
          if (room <= 0) continue;
          const amount = 1 + randInt(room);
          await doTransfer(from, to.publicKey, amount); // hook must allow (within cap)
        } else if (kind === "distribute") {
          // Record a royalty payout that (in production) the API paid off-chain. No funds
          // move here; only the ledger figure advances.
          const amount = 1_000 * (1 + randInt(50));
          await royalty.methods
            .recordDistribution(new anchor.BN(amount), Array(32).fill(0), Array(64).fill(0))
            .accountsPartial({ authority: authority.publicKey, globalConfig, listing, distribution: distributionPda(distributionCount) })
            .rpc();
          cumulativeDistributed += BigInt(amount);
          distributionCount += 1;
        }
      } catch (e: any) {
        // A rejected op must not corrupt invariants; log seed+op for replay and continue.
        console.log(`op ${op} (${kind}) rejected: ${String(e.message).slice(0, 80)}`);
      }
      await checkInvariants();
    }
  });
});
