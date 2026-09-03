/**
 * End-to-end suite for royalty_shares + transfer_hook against a local validator.
 *
 * Two describe blocks share one validator and one singleton GlobalConfig (init is made
 * idempotent so file order doesn't matter, and `treasury`/`sbstMint` are read back from it):
 *
 *  - "primary flow"        — global init, KYC registration, listing creation (the Token-2022
 *                            mint w/ hook + metadata pointer), a primary buy, and a royalty
 *                            deposit → pro-rata claim.
 *  - "transfer-hook compliance" — drives real Token-2022 transfers via
 *    `createTransferCheckedWithTransferHookInstruction` (which auto-resolves the hook's extra
 *    accounts) and asserts the gate: a compliant transfer succeeds; a secondary holder can
 *    transfer onward (no primary position); and unregistered / sanctioned / blocked / paused /
 *    over-cap / locked-up / wrong-jurisdiction / non-accredited transfers all revert.
 *
 * Helpers (`setupListing`, `buy`, `transferShares`, `registerIdentity`, …) keep each test
 * to a few lines. See `fuzz_invariants.ts` for randomized economic-invariant coverage.
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
  getOrCreateAssociatedTokenAccount,
  createAssociatedTokenAccountIdempotent,
  createAssociatedTokenAccountIdempotentInstruction,
  mintTo,
  getAssociatedTokenAddressSync,
  getAccount,
  createTransferCheckedWithTransferHookInstruction,
} from "@solana/spl-token";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  SYSVAR_INSTRUCTIONS_PUBKEY,
  Transaction,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import { assert } from "chai";

describe("stradebase royalty shares", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const royalty = anchor.workspace.royaltyShares as Program<RoyaltyShares>;
  const hook = anchor.workspace.transferHook as Program<TransferHook>;
  const authority = provider.wallet; // ops + compliance authority
  const payer = (authority as any).payer as Keypair;

  const artist = Keypair.generate();

  let sbstMint: PublicKey;
  let treasury: PublicKey; // read from global config (shared across test files)

  const [globalConfig] = PublicKey.findProgramAddressSync(
    [Buffer.from("global_config")],
    royalty.programId
  );
  const BPF_LOADER_UPGRADEABLE = new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111");
  const [programData] = PublicKey.findProgramAddressSync(
    [royalty.programId.toBuffer()],
    BPF_LOADER_UPGRADEABLE
  );

  // ---------- helpers ----------
  const airdrop = async (pk: PublicKey, sol = 5) => {
    const sig = await provider.connection.requestAirdrop(pk, sol * LAMPORTS_PER_SOL);
    await provider.connection.confirmTransaction(sig);
  };

  const songBuf = (label: string) => {
    const b = Buffer.alloc(32);
    b.write(label);
    return b;
  };

  const listingPdas = (songId: Buffer, creator: PublicKey = artist.publicKey) => {
    const [listing] = PublicKey.findProgramAddressSync(
      [Buffer.from("listing"), creator.toBuffer(), songId],
      royalty.programId
    );
    const [shareMint] = PublicKey.findProgramAddressSync(
      [Buffer.from("share_mint"), listing.toBuffer()],
      royalty.programId
    );
    const [compliance] = PublicKey.findProgramAddressSync(
      [Buffer.from("compliance"), shareMint.toBuffer()],
      royalty.programId
    );
    return { listing, shareMint, compliance };
  };

  const identityPda = (user: PublicKey) =>
    PublicKey.findProgramAddressSync(
      [Buffer.from("identity"), user.toBuffer()],
      royalty.programId
    )[0];

  const userProfilePda = (user: PublicKey) =>
    PublicKey.findProgramAddressSync(
      [Buffer.from("user_profile"), user.toBuffer()],
      royalty.programId
    )[0];

  /** Create the platform profile if it doesn't exist yet (idempotent for test reuse). */
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

  const registerIdentity = async (
    user: PublicKey,
    opts: { kyc?: number; juris?: number[]; status?: any; accredited?: boolean; pii?: number[] } = {}
  ) => {
    await royalty.methods
      .registerIdentity({
        kycLevel: opts.kyc ?? 2,
        jurisdiction: opts.juris ?? [71, 66], // "GB"
        status: opts.status ?? { ok: {} },
        piiCommitment: opts.pii ?? null,
        accredited: opts.accredited ?? true,
      })
      .accountsPartial({
        complianceAuthority: authority.publicKey,
        globalConfig,
        user,
        identity: identityPda(user),
      })
      .rpc();
  };

  const fundSbst = async (owner: PublicKey, amount: number) => {
    const ata = await getOrCreateAssociatedTokenAccount(
      provider.connection, payer, sbstMint, owner, false, undefined, undefined, TOKEN_PROGRAM_ID
    );
    await mintTo(provider.connection, payer, sbstMint, ata.address, authority.publicKey, amount, [], undefined, TOKEN_PROGRAM_ID);
    return ata.address;
  };

  interface ListingOpts {
    totalShares?: number;
    pricePerShare?: number;
    lockupSeconds?: number;
    requiresAccredited?: boolean;
    allowedJurisdictions?: number[][];
    maxSharesPerWallet?: number;
  }

  const setupListing = async (label: string, opts: ListingOpts = {}) => {
    const songId = songBuf(label);
    const p = listingPdas(songId);
    await ensureProfile(artist, "artist"); // only Artist/Both may create listings
    await royalty.methods
      .createListing({
        songId: Array.from(songId),
        metadataUri: `https://cdn.stradebase.xyz/${label}.json`,
        totalShares: new anchor.BN(opts.totalShares ?? 1000),
        pricePerShare: new anchor.BN(opts.pricePerShare ?? 1_000_000),
        royaltyPercentSold: 5000,
        artistRetainedPercent: 5000,
        startTime: new anchor.BN(0),
        endTime: null,
        lockupSeconds: new anchor.BN(opts.lockupSeconds ?? 0),
        requiresAccredited: opts.requiresAccredited ?? false,
        allowedJurisdictions: opts.allowedJurisdictions ?? [],
        maxSharesPerWallet: new anchor.BN(opts.maxSharesPerWallet ?? 0),
      })
      .accountsPartial({
        artist: artist.publicKey,
        artistProfile: userProfilePda(artist.publicKey),
        globalConfig,
        listing: p.listing,
        shareMint: p.shareMint,
        complianceConfig: p.compliance,
        transferHookProgram: hook.programId,
        token2022Program: TOKEN_2022_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([artist])
      .rpc();

    const [extraMetas] = PublicKey.findProgramAddressSync(
      [Buffer.from("extra-account-metas"), p.shareMint.toBuffer()],
      hook.programId
    );
    await hook.methods
      .initializeExtraAccountMetaList()
      .accountsPartial({
        payer: authority.publicKey,
        extraAccountMetaList: extraMetas,
        mint: p.shareMint,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    return p;
  };

  // Primary issuance. The program moves no money, so there is no SBST leg — payment is an
  // off-chain concern; `settlementAmount` is recorded from the (simulated) off-chain charge.
  const buy = async (
    p: ReturnType<typeof listingPdas>,
    buyer: Keypair,
    shares: number,
    settlement = 0
  ) => {
    await ensureProfile(buyer, "investor");
    const buyerShareAta = getAssociatedTokenAddressSync(p.shareMint, buyer.publicKey, false, TOKEN_2022_PROGRAM_ID);
    const [position] = PublicKey.findProgramAddressSync(
      [Buffer.from("position"), p.shareMint.toBuffer(), buyer.publicKey.toBuffer()],
      royalty.programId
    );
    const l = await royalty.account.songListing.fetch(p.listing);
    const [tradeRecord] = PublicKey.findProgramAddressSync(
      [Buffer.from("trade"), p.listing.toBuffer(), l.totalTrades.toArrayLike(Buffer, "le", 8)],
      royalty.programId
    );

    await royalty.methods
      .buyShares(new anchor.BN(shares), new anchor.BN(settlement), Array(64).fill(0))
      .accountsPartial({
        buyer: buyer.publicKey,
        globalConfig,
        listing: p.listing,
        buyerIdentity: identityPda(buyer.publicKey),
        buyerProfile: userProfilePda(buyer.publicKey),
        complianceConfig: p.compliance,
        shareMint: p.shareMint,
        buyerShareAta,
        position,
        tradeRecord,
        token2022Program: TOKEN_2022_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([buyer])
      .rpc();
    return buyerShareAta;
  };

  // Build + send a hook-aware share transfer. Returns a promise that rejects if the hook denies it.
  const transferShares = async (
    shareMint: PublicKey,
    from: Keypair,
    to: PublicKey,
    amount: number
  ) => {
    const src = getAssociatedTokenAddressSync(shareMint, from.publicKey, false, TOKEN_2022_PROGRAM_ID);
    const dst = getAssociatedTokenAddressSync(shareMint, to, false, TOKEN_2022_PROGRAM_ID);
    // Ensure the destination ATA exists (creation is not gated by the hook).
    await createAssociatedTokenAccountIdempotent(
      provider.connection, payer, shareMint, to, {}, TOKEN_2022_PROGRAM_ID
    );
    const ix = await createTransferCheckedWithTransferHookInstruction(
      provider.connection, src, shareMint, dst, from.publicKey,
      BigInt(amount), 0, [], "confirmed", TOKEN_2022_PROGRAM_ID
    );
    const tx = new Transaction().add(ix);
    return provider.sendAndConfirm(tx, [from]);
  };

  const expectReject = async (p: Promise<any>, label: string) => {
    try {
      await p;
      assert.fail(`expected rejection: ${label}`);
    } catch (e: any) {
      if (String(e.message).includes(`expected rejection`)) throw e;
      // otherwise: a program/hook error is the expected outcome
    }
  };

  before(async () => {
    await airdrop(authority.publicKey, 100);
    await airdrop(artist.publicKey);
    // Global config is a singleton shared across test files; init once, else reuse.
    const existing = await provider.connection.getAccountInfo(globalConfig);
    if (existing) {
      const cfg = await royalty.account.globalConfig.fetch(globalConfig);
      sbstMint = cfg.sbstMint;
      treasury = cfg.treasury;
    } else {
      treasury = Keypair.generate().publicKey;
      sbstMint = await createMint(
        provider.connection, payer, authority.publicKey, null, 6, undefined, undefined, TOKEN_PROGRAM_ID
      );
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
    }
  });

  // ---------------- primary flow ----------------
  describe("primary flow", () => {
    const buyer = Keypair.generate();
    let open: ReturnType<typeof listingPdas>;

    it("registers the buyer and funds SBST", async () => {
      await airdrop(buyer.publicKey);
      await registerIdentity(buyer.publicKey, { kyc: 2, accredited: true });
      await fundSbst(buyer.publicKey, 100_000_000);
    });

    it("creates a listing (Token-2022 mint w/ hook + metadata pointer)", async () => {
      open = await setupListing("open-song");
      const l = await royalty.account.songListing.fetch(open.listing);
      assert.equal(l.totalShares.toNumber(), 1000);
      assert.equal(l.shareMint.toBase58(), open.shareMint.toBase58());
    });

    it("issues shares and records the settlement amount (no money moves)", async () => {
      const ata = await buy(open, buyer, 10, 10_000_000); // 10 shares, £10.00 settled off-chain
      const acct = await getAccount(provider.connection, ata, undefined, TOKEN_2022_PROGRAM_ID);
      assert.equal(acct.amount.toString(), "10");

      const l = await royalty.account.songListing.fetch(open.listing);
      const [tradeRecord] = PublicKey.findProgramAddressSync(
        [Buffer.from("trade"), open.listing.toBuffer(), (l.totalTrades.toNumber() - 1 >= 0
          ? new anchor.BN(l.totalTrades.toNumber() - 1) : new anchor.BN(0)).toArrayLike(Buffer, "le", 8)],
        royalty.programId
      );
      const tr = await royalty.account.tradeRecord.fetch(tradeRecord);
      assert.equal(tr.settlementAmount.toString(), "10000000");
      assert.equal(tr.sharesAmount.toString(), "10");
    });

    it("records a royalty distribution (payout happens off-chain)", async () => {
      const listing = open.listing;
      const before = await royalty.account.songListing.fetch(listing);
      const [distribution] = PublicKey.findProgramAddressSync(
        [Buffer.from("distribution"), listing.toBuffer(), before.totalDistributions.toArrayLike(Buffer, "le", 8)],
        royalty.programId
      );
      const merkle = Array.from(Buffer.alloc(32, 3)); // stand-in commitment to the payout list
      const reference = Array.from(Buffer.alloc(64)); reference[0] = 42;

      await royalty.methods
        .recordDistribution(new anchor.BN(10_000_000), merkle, reference)
        .accountsPartial({ authority: authority.publicKey, globalConfig, listing, distribution })
        .rpc();

      const d = await royalty.account.distributionRecord.fetch(distribution);
      assert.equal(d.totalAmount.toString(), "10000000");
      assert.deepEqual(Array.from(d.merkleRoot), merkle);
      const after = await royalty.account.songListing.fetch(listing);
      assert.equal(after.totalDistributions.toNumber(), before.totalDistributions.toNumber() + 1);
      assert.equal(
        after.cumulativeRoyalties.toString(),
        before.cumulativeRoyalties.add(new anchor.BN(10_000_000)).toString()
      );
    });

    it("rejects a distribution from a non-ops signer", async () => {
      const before = await royalty.account.songListing.fetch(open.listing);
      const [distribution] = PublicKey.findProgramAddressSync(
        [Buffer.from("distribution"), open.listing.toBuffer(), before.totalDistributions.toArrayLike(Buffer, "le", 8)],
        royalty.programId
      );
      await expectReject(
        royalty.methods
          .recordDistribution(new anchor.BN(1), Array(32).fill(0), Array(64).fill(0))
          .accountsPartial({ authority: artist.publicKey, globalConfig, listing: open.listing, distribution })
          .signers([artist])
          .rpc(),
        "non-ops distribution"
      );
    });
  });

  // ---------------- profiles, roles and the adjustable platform fee ----------------
  describe("profiles & platform fee", () => {
    it("counts the artist's listings and the buyer's trades", async () => {
      const before = await royalty.account.userProfile.fetch(userProfilePda(artist.publicKey));
      const buyer = Keypair.generate();
      await airdrop(buyer.publicKey);
      await registerIdentity(buyer.publicKey, { kyc: 2, accredited: true });
      await fundSbst(buyer.publicKey, 100_000_000);

      const p = await setupListing("counter-song");
      await buy(p, buyer, 3);

      const after = await royalty.account.userProfile.fetch(userProfilePda(artist.publicKey));
      assert.equal(after.listingsCreated.toNumber(), before.listingsCreated.toNumber() + 1);
      const bp = await royalty.account.userProfile.fetch(userProfilePda(buyer.publicKey));
      assert.equal(bp.tradesCount.toNumber(), 1);
    });

    it("refuses to create a listing from an Investor-role profile", async () => {
      // A fresh artist wallet that signed up as an investor: the role gate must bite
      // before any mint or vault account is created.
      const wannabe = Keypair.generate();
      await airdrop(wannabe.publicKey);
      await ensureProfile(wannabe, "investor");
      const songId = songBuf("investor-cannot-list");
      const p = listingPdas(songId, wannabe.publicKey);
      await expectReject(
        royalty.methods
          .createListing({
            songId: Array.from(songId),
            metadataUri: "https://cdn.stradebase.xyz/nope.json",
            totalShares: new anchor.BN(100),
            pricePerShare: new anchor.BN(1_000_000),
            royaltyPercentSold: 5000,
            artistRetainedPercent: 5000,
            startTime: new anchor.BN(0),
            endTime: null,
            lockupSeconds: new anchor.BN(0),
            requiresAccredited: false,
            allowedJurisdictions: [],
            maxSharesPerWallet: new anchor.BN(0),
          })
          .accountsPartial({
            artist: wannabe.publicKey,
            artistProfile: userProfilePda(wannabe.publicKey),
            globalConfig,
            listing: p.listing,
            shareMint: p.shareMint,
            complianceConfig: p.compliance,
            transferHookProgram: hook.programId,
            token2022Program: TOKEN_2022_PROGRAM_ID,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .signers([wannabe])
          .rpc(),
        "investor cannot create a listing"
      );

      // …and succeeds once the same wallet upgrades itself to Both.
      await royalty.methods
        .updateUserRole({ both: {} } as any)
        .accountsPartial({ user: wannabe.publicKey, profile: userProfilePda(wannabe.publicKey) })
        .signers([wannabe])
        .rpc();
      const prof = await royalty.account.userProfile.fetch(userProfilePda(wannabe.publicKey));
      assert.deepEqual(prof.role, { both: {} });
    });

    it("updates the platform fee and rejects out-of-range values", async () => {
      const original = (await royalty.account.globalConfig.fetch(globalConfig)).platformFeeBps;
      await royalty.methods
        .updatePlatformFee(333)
        .accountsPartial({ authority: authority.publicKey, globalConfig })
        .rpc();
      assert.equal((await royalty.account.globalConfig.fetch(globalConfig)).platformFeeBps, 333);

      await expectReject(
        royalty.methods
          .updatePlatformFee(10_001)
          .accountsPartial({ authority: authority.publicKey, globalConfig })
          .rpc(),
        "fee above 100%"
      );

      // Restore so later tests see the original economics.
      await royalty.methods
        .updatePlatformFee(original)
        .accountsPartial({ authority: authority.publicKey, globalConfig })
        .rpc();
    });
  });

  // ---------------- secondary trade recorded on-chain (ledger completeness) ----------------
  describe("secondary trade ledger", () => {
    const seller = Keypair.generate();
    const buyer2 = Keypair.generate();
    let open: ReturnType<typeof listingPdas>;

    const tradeRecordPda = (listing: PublicKey, index: number) =>
      PublicKey.findProgramAddressSync(
        [Buffer.from("trade"), listing.toBuffer(), new anchor.BN(index).toArrayLike(Buffer, "le", 8)],
        royalty.programId
      )[0];

    before(async () => {
      await airdrop(seller.publicKey);
      await airdrop(buyer2.publicKey);
      await registerIdentity(seller.publicKey, { kyc: 2, accredited: true });
      await registerIdentity(buyer2.publicKey, { kyc: 2, accredited: true });
      open = await setupListing("secondary-ledger-song");
      await buy(open, seller, 20, 20_000_000); // seller acquires shares in the primary sale
    });

    it("records a secondary sale on-chain in the same tx as the transfer", async () => {
      const before = await royalty.account.songListing.fetch(open.listing);
      const idx = before.totalTrades.toNumber();
      const src = getAssociatedTokenAddressSync(open.shareMint, seller.publicKey, false, TOKEN_2022_PROGRAM_ID);
      const dst = getAssociatedTokenAddressSync(open.shareMint, buyer2.publicKey, false, TOKEN_2022_PROGRAM_ID);

      // The hook resolver reads the destination ATA at build time, so create it first.
      await createAssociatedTokenAccountIdempotent(
        provider.connection, payer, open.shareMint, buyer2.publicKey, {}, TOKEN_2022_PROGRAM_ID
      );
      const transferIx = await createTransferCheckedWithTransferHookInstruction(
        provider.connection, src, open.shareMint, dst, seller.publicKey,
        BigInt(5), 0, [], "confirmed", TOKEN_2022_PROGRAM_ID
      );
      const recordIx = await royalty.methods
        .recordSecondaryTrade(new anchor.BN(5), new anchor.BN(5_000_000), Array(64).fill(0))
        .accountsPartial({
          seller: seller.publicKey,
          listing: open.listing,
          buyer: buyer2.publicKey,
          tradeRecord: tradeRecordPda(open.listing, idx),
          instructions: SYSVAR_INSTRUCTIONS_PUBKEY,
          systemProgram: SystemProgram.programId,
        })
        .instruction();

      // transfer + record land atomically: a recorded trade always has a real transfer.
      await provider.sendAndConfirm(new Transaction().add(transferIx, recordIx), [seller]);

      const tr = await royalty.account.tradeRecord.fetch(tradeRecordPda(open.listing, idx));
      assert.deepEqual(tr.tradeType, { secondary: {} });
      assert.equal(tr.from.toBase58(), seller.publicKey.toBase58());
      assert.equal(tr.to.toBase58(), buyer2.publicKey.toBase58());
      assert.equal(tr.sharesAmount.toString(), "5");
      assert.equal(tr.settlementAmount.toString(), "5000000");

      const after = await royalty.account.songListing.fetch(open.listing);
      assert.equal(after.totalTrades.toNumber(), idx + 1);
      // The shares actually moved.
      const dstAcct = await getAccount(provider.connection, dst, undefined, TOKEN_2022_PROGRAM_ID);
      assert.equal(dstAcct.amount.toString(), "5");
    });

    it("rejects a record with no matching transfer in the transaction", async () => {
      const idx = (await royalty.account.songListing.fetch(open.listing)).totalTrades.toNumber();
      await expectReject(
        royalty.methods
          .recordSecondaryTrade(new anchor.BN(1), new anchor.BN(0), Array(64).fill(0))
          .accountsPartial({
            seller: seller.publicKey,
            listing: open.listing,
            buyer: buyer2.publicKey,
            tradeRecord: tradeRecordPda(open.listing, idx),
            instructions: SYSVAR_INSTRUCTIONS_PUBKEY,
            systemProgram: SystemProgram.programId,
          })
          .signers([seller])
          .rpc(),
        "record without a backing transfer"
      );
    });

    it("rejects a record whose buyer isn't the transfer's actual recipient", async () => {
      // A real transfer to buyer2, but the record claims a different buyer → destination binding
      // must reject it, so the ledger's `to` can't be forged away from where shares actually went.
      const idx = (await royalty.account.songListing.fetch(open.listing)).totalTrades.toNumber();
      const impostor = Keypair.generate();
      await registerIdentity(impostor.publicKey, { kyc: 2, accredited: true });
      const src = getAssociatedTokenAddressSync(open.shareMint, seller.publicKey, false, TOKEN_2022_PROGRAM_ID);
      const dst = getAssociatedTokenAddressSync(open.shareMint, buyer2.publicKey, false, TOKEN_2022_PROGRAM_ID);
      const transferIx = await createTransferCheckedWithTransferHookInstruction(
        provider.connection, src, open.shareMint, dst, seller.publicKey,
        BigInt(1), 0, [], "confirmed", TOKEN_2022_PROGRAM_ID
      );
      const recordIx = await royalty.methods
        .recordSecondaryTrade(new anchor.BN(1), new anchor.BN(0), Array(64).fill(0))
        .accountsPartial({
          seller: seller.publicKey,
          listing: open.listing,
          buyer: impostor.publicKey, // ← lies about the recipient
          tradeRecord: tradeRecordPda(open.listing, idx),
          instructions: SYSVAR_INSTRUCTIONS_PUBKEY,
          systemProgram: SystemProgram.programId,
        })
        .instruction();
      await expectReject(
        provider.sendAndConfirm(new Transaction().add(transferIx, recordIx), [seller]),
        "record with a mismatched buyer"
      );
    });
  });

  // ---------------- identity layer: usernames + PII commitments ----------------
  describe("identity: usernames & PII commitments", () => {
    const usernamePda = (name: string) =>
      PublicKey.findProgramAddressSync(
        [Buffer.from("username"), Buffer.from(name)],
        royalty.programId
      )[0];

    const claim = (kp: Keypair, name: string) =>
      royalty.methods
        .claimUsername(name)
        .accountsPartial({
          payer: authority.publicKey,
          user: kp.publicKey,
          profile: userProfilePda(kp.publicKey),
          usernameRecord: usernamePda(name),
          systemProgram: SystemProgram.programId,
        })
        .signers([kp])
        .rpc();

    const alice = Keypair.generate();
    const mallory = Keypair.generate();

    before(async () => {
      await airdrop(alice.publicKey);
      await airdrop(mallory.publicKey);
      await ensureProfile(alice, "investor");
      await ensureProfile(mallory, "investor");
    });

    it("claims a username and mirrors it onto the profile", async () => {
      await claim(alice, "alice_01");
      const rec = await royalty.account.usernameRecord.fetch(usernamePda("alice_01"));
      assert.equal(rec.owner.toBase58(), alice.publicKey.toBase58());
      const prof = await royalty.account.userProfile.fetch(userProfilePda(alice.publicKey));
      assert.equal(prof.username, "alice_01");
    });

    it("rejects a second claim on a taken name", async () => {
      // The PDA already holds an account, so `init` fails — this is the uniqueness
      // guarantee, enforced by the runtime rather than by a reservation table.
      await expectReject(claim(mallory, "alice_01"), "duplicate username");
    });

    it("rejects names outside [a-z0-9_]{3,32}", async () => {
      await expectReject(claim(mallory, "ab"), "too short");
      // Uppercase and non-ASCII are refused rather than normalized: this is what makes
      // `Alice_01` / `alice_01` / Cyrillic lookalikes unable to collide in the first place.
      await expectReject(claim(mallory, "Alice_01"), "uppercase");
      await expectReject(claim(mallory, "alice-01"), "hyphen");
      await expectReject(claim(mallory, "аlice_01"), "cyrillic homoglyph");
    });

    it("cannot even address a name longer than the 32-byte seed limit", async () => {
      // Over-long names fail at PDA derivation, so there is no account to claim and no
      // transaction to send. The on-chain length check is the belt to this braces —
      // it still matters for multi-byte input that fits in 32 bytes but not 32 chars.
      assert.throws(() => usernamePda("a".repeat(33)), /seed/i);
    });

    it("refuses a second username for the same profile", async () => {
      await expectReject(claim(alice, "alice_02"), "profile already has a username");
    });

    it("releases a name, freeing it for someone else", async () => {
      await royalty.methods
        .releaseUsername("alice_01")
        .accountsPartial({
          user: alice.publicKey,
          profile: userProfilePda(alice.publicKey),
          usernameRecord: usernamePda("alice_01"),
        })
        .signers([alice])
        .rpc();

      const prof = await royalty.account.userProfile.fetch(userProfilePda(alice.publicKey));
      assert.equal(prof.username, "");
      assert.isNull(await provider.connection.getAccountInfo(usernamePda("alice_01")));

      await claim(mallory, "alice_01"); // now available
      const rec = await royalty.account.usernameRecord.fetch(usernamePda("alice_01"));
      assert.equal(rec.owner.toBase58(), mallory.publicKey.toBase58());
    });

    it("stores a PII commitment and bumps the version only on change", async () => {
      const c1 = Array.from(Buffer.alloc(32, 7));
      const c2 = Array.from(Buffer.alloc(32, 9));
      await registerIdentity(alice.publicKey, { pii: c1 });
      let id = await royalty.account.identityRegistry.fetch(identityPda(alice.publicKey));
      assert.deepEqual(Array.from(id.piiCommitment), c1);
      assert.equal(id.piiVersion, 1);
      assert.equal(id.commitmentScheme, 1);

      // Re-submitting the same commitment must not inflate the counter — the backend
      // mirrors this number, and drift is the tamper signal.
      await registerIdentity(alice.publicKey, { pii: c1 });
      id = await royalty.account.identityRegistry.fetch(identityPda(alice.publicKey));
      assert.equal(id.piiVersion, 1);

      // A status-only update leaves the commitment untouched.
      await registerIdentity(alice.publicKey, { status: { restricted: {} } });
      id = await royalty.account.identityRegistry.fetch(identityPda(alice.publicKey));
      assert.deepEqual(Array.from(id.piiCommitment), c1);
      assert.equal(id.piiVersion, 1);

      // A real re-verification via the dedicated instruction bumps it, and does not
      // disturb the compliance status.
      await royalty.methods
        .setPiiCommitment(c2)
        .accountsPartial({
          complianceAuthority: authority.publicKey,
          globalConfig,
          identity: identityPda(alice.publicKey),
        })
        .rpc();
      id = await royalty.account.identityRegistry.fetch(identityPda(alice.publicKey));
      assert.deepEqual(Array.from(id.piiCommitment), c2);
      assert.equal(id.piiVersion, 2);
      assert.deepEqual(id.status, { restricted: {} });

      await registerIdentity(alice.publicKey, { status: { ok: {} } }); // restore
    });
  });

  // ---------------- secondary transfers / transfer-hook compliance ----------------
  describe("transfer-hook compliance", () => {
    const seller = Keypair.generate();     // KYC'd GB, accredited
    const recipient = Keypair.generate();  // KYC'd GB, accredited
    let open: ReturnType<typeof listingPdas>;

    before(async () => {
      await airdrop(seller.publicKey);
      await registerIdentity(seller.publicKey, { kyc: 2, accredited: true });
      await registerIdentity(recipient.publicKey, { kyc: 2, accredited: true });
      await fundSbst(seller.publicKey, 100_000_000);
      open = await setupListing("secondary-song");
      await buy(open, seller, 20); // seller now holds 20 shares (no lockup, no cap)
    });

    it("allows transfer to a KYC'd recipient", async () => {
      await transferShares(open.shareMint, seller, recipient.publicKey, 5);
      const dst = getAssociatedTokenAddressSync(open.shareMint, recipient.publicKey, false, TOKEN_2022_PROGRAM_ID);
      const acct = await getAccount(provider.connection, dst, undefined, TOKEN_2022_PROGRAM_ID);
      assert.equal(acct.amount.toString(), "5");
    });

    it("allows a secondary holder to transfer onward (no primary position)", async () => {
      // `recipient` acquired shares only via secondary transfer, so it has no
      // HolderPosition. This validates the hook tolerates a missing source
      // position instead of bricking the market after the first hop.
      const third = Keypair.generate();
      await registerIdentity(third.publicKey, { kyc: 2, accredited: true });
      await transferShares(open.shareMint, recipient, third.publicKey, 2);
      const dst = getAssociatedTokenAddressSync(open.shareMint, third.publicKey, false, TOKEN_2022_PROGRAM_ID);
      const acct = await getAccount(provider.connection, dst, undefined, TOKEN_2022_PROGRAM_ID);
      assert.equal(acct.amount.toString(), "2");
    });

    it("rejects transfer to an unregistered wallet", async () => {
      const stranger = Keypair.generate();
      await expectReject(
        transferShares(open.shareMint, seller, stranger.publicKey, 1),
        "unregistered recipient"
      );
    });

    it("rejects transfer to a frozen recipient", async () => {
      const bad = Keypair.generate();
      await registerIdentity(bad.publicKey, { kyc: 2, status: { frozen: {} } });
      await expectReject(
        transferShares(open.shareMint, seller, bad.publicKey, 1),
        "frozen recipient"
      );
    });

    it("lets a Restricted wallet receive but not send", async () => {
      // The asymmetry is deliberate: freezing outflow during a review must not strand a
      // counterparty who is mid-settlement, so inbound stays open.
      const underReview = Keypair.generate();
      await airdrop(underReview.publicKey);
      await registerIdentity(underReview.publicKey, { kyc: 2 });

      await transferShares(open.shareMint, seller, underReview.publicKey, 3);
      await registerIdentity(underReview.publicKey, { kyc: 2, status: { restricted: {} } });

      // Still receives.
      await transferShares(open.shareMint, seller, underReview.publicKey, 1);
      const dst = getAssociatedTokenAddressSync(open.shareMint, underReview.publicKey, false, TOKEN_2022_PROGRAM_ID);
      assert.equal(
        (await getAccount(provider.connection, dst, undefined, TOKEN_2022_PROGRAM_ID)).amount.toString(),
        "4"
      );

      // But cannot send.
      const sink = Keypair.generate();
      await registerIdentity(sink.publicKey, { kyc: 2 });
      await expectReject(
        transferShares(open.shareMint, underReview, sink.publicKey, 1),
        "restricted sender"
      );
    });

    it("rejects transfer to a blocked recipient", async () => {
      await royalty.methods
        .blockUser(recipient.publicKey)
        .accountsPartial({
          complianceAuthority: authority.publicKey,
          globalConfig,
          complianceConfig: open.compliance,
        })
        .rpc();
      await expectReject(
        transferShares(open.shareMint, seller, recipient.publicKey, 1),
        "blocked recipient"
      );
      // unblock so later assertions are clean
      await royalty.methods
        .unblockUser(recipient.publicKey)
        .accountsPartial({
          complianceAuthority: authority.publicKey,
          globalConfig,
          complianceConfig: open.compliance,
        })
        .rpc();
    });

    it("rejects transfers while globally paused", async () => {
      await royalty.methods
        .setGlobalPause(true)
        .accountsPartial({ authority: authority.publicKey, globalConfig })
        .rpc();
      await expectReject(
        transferShares(open.shareMint, seller, recipient.publicKey, 1),
        "global pause"
      );
      await royalty.methods
        .setGlobalPause(false)
        .accountsPartial({ authority: authority.publicKey, globalConfig })
        .rpc();
    });

    it("rejects transfer that exceeds the per-wallet cap", async () => {
      // Dedicated listing with cap 5. Two holders each buy 5 (at cap). Sending 1 more
      // to a holder already at the cap pushes them to 6 > 5 → rejected.
      const capped = await setupListing("capped-song", { maxSharesPerWallet: 5 });
      const holderA = Keypair.generate();
      const holderB = Keypair.generate();
      for (const kp of [holderA, holderB]) {
        await airdrop(kp.publicKey);
        await registerIdentity(kp.publicKey, { kyc: 2, accredited: true });
        await fundSbst(kp.publicKey, 100_000_000);
        await buy(capped, kp, 5); // exactly at cap is allowed at buy time
      }
      await expectReject(
        transferShares(capped.shareMint, holderA, holderB.publicKey, 1),
        "exceeds per-wallet cap"
      );
    });

    it("rejects transfer while the sender is under lockup", async () => {
      const locked = await setupListing("locked-song", { lockupSeconds: 3600 });
      await fundSbst(seller.publicKey, 100_000_000);
      await buy(locked, seller, 10); // unlock_time = now + 3600
      await expectReject(
        transferShares(locked.shareMint, seller, recipient.publicKey, 1),
        "sender under lockup"
      );
    });

    it("rejects transfer to a recipient outside the allowed jurisdiction (validates listing resolution)", async () => {
      const geo = await setupListing("geo-song", { allowedJurisdictions: [[71, 66]] }); // GB only
      await fundSbst(seller.publicKey, 100_000_000);
      await buy(geo, seller, 10);
      const usWallet = Keypair.generate();
      await registerIdentity(usWallet.publicKey, { kyc: 2, juris: [85, 83], accredited: true }); // "US"
      await expectReject(
        transferShares(geo.shareMint, seller, usWallet.publicKey, 1),
        "jurisdiction not allowed"
      );
    });

    it("rejects transfer to a non-accredited recipient on an accredited-only listing", async () => {
      const acc = await setupListing("accredited-song", { requiresAccredited: true });
      await fundSbst(seller.publicKey, 100_000_000);
      await buy(acc, seller, 10);
      const retail = Keypair.generate();
      await registerIdentity(retail.publicKey, { kyc: 1, accredited: false });
      await expectReject(
        transferShares(acc.shareMint, seller, retail.publicKey, 1),
        "recipient not accredited"
      );
    });
  });
});
