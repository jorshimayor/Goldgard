/**
 * HTTP surface for the on-chain `royalty_shares` program, so the whole platform (not just
 * tokens) is testable over REST.
 *
 * Each write endpoint is **custodial for testing**: it accepts the acting wallet's secret-key
 * array and signs with it (that wallet is both the transaction signer and fee payer). In a
 * non-custodial production flow you'd build the transaction and have the user's wallet sign it
 * instead — the account sets here are the reference.
 *
 * This program is a **ledger of record** — it moves no money. Payment for shares and royalty
 * payouts are settled off-chain by the API; the writes here only issue/move the share asset
 * and record economic events (`buyShares` mints + records a trade, `recordDistribution` logs a
 * payout). `SBTS_MINT` is stored on-chain as the settlement-currency reference only.
 */
import { AnchorProvider, BN, Wallet } from "@anchor-lang/core";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedWithTransferHookInstruction,
} from "@solana/spl-token";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  SYSVAR_INSTRUCTIONS_PUBKEY,
  type TransactionInstruction,
} from "@solana/web3.js";
import {
  ROYALTY_SHARES_PROGRAM_ID,
  TRANSFER_HOOK_PROGRAM_ID,
  compliancePda,
  createPrograms,
  distributionPda,
  extraAccountMetaListPda,
  getGlobalConfig,
  getIdentity,
  getListing,
  getPosition,
  globalConfigPda,
  identityPda,
  listingPda,
  positionPda,
  shareAta,
  shareMintPda,
  tradeRecordPda,
  userProfilePda,
  usernamePda,
} from "@stradebase/onchain";
import { assertUsername, commit, newSalt, toBytes32 } from "./pii.js";
import { Indexer } from "../indexer/indexer.js";
import { getStore } from "../indexer/store.js";
import { resolveSigner } from "../signing/resolve.js";
import type { TxSigner } from "../signing/signer.js";

import { admin, connection } from "../solana.js";
import { config } from "../config.js";
import { ApiError } from "../http.js";
import { submit } from "../tx/engine.js";

const BPF_LOADER_UPGRADEABLE = new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111");

/**
 * Resolve the acting signer for a write and build the typed programs bound to its public key.
 *
 * The signer comes from {@link resolveSigner} — a local keypair (`secret` in body, dev) or a
 * **custody** signer (`keyRef` → KMS/MPC via the signer service). Anchor only needs the provider
 * to *build* instructions here (we sign through the engine, not Anchor), so the wallet is a
 * pubkey-only shim whose sign methods are never called. Field is named `kp` for continuity — it is
 * a `TxSigner`, not necessarily a keypair.
 */
async function resolveActor(body: any) {
  const kp = await resolveSigner(body);
  const wallet = {
    publicKey: kp.publicKey,
    signTransaction: async (t: any) => t,
    signAllTransactions: async (t: any) => t,
  };
  const provider = new AnchorProvider(connection, wallet as unknown as Wallet, { commitment: "confirmed" });
  return { ...createPrograms(provider), kp };
}

// A read-only program instance (admin wallet is never asked to sign for reads).
const read = createPrograms(new AnchorProvider(connection, new Wallet(admin), { commitment: "confirmed" })).royalty;

/**
 * Build the instruction and submit it through the resilient engine (priority fee +
 * fresh-blockhash retry + bounded concurrency). The acting signer `kp` is the signer and
 * fee payer. `cuLimit` is generous by default so compute-heavy instructions (create_listing,
 * buy_shares) never hit a compute-unit cap; the priority-fee cost of a high limit is tiny.
 */
async function send(
  builder: { instruction: () => Promise<TransactionInstruction> },
  kp: TxSigner,
  cuLimit = 800_000,
): Promise<string> {
  const ix = await builder.instruction();
  return submit([ix], [], kp, { computeUnitLimit: cuLimit });
}

/** Recursively render PublicKey → base58, BN/bigint → string for JSON responses. */
export function plainify(v: any): any {
  if (v == null) return v;
  if (typeof v === "bigint") return v.toString();
  if (BN.isBN(v)) return v.toString();
  if (typeof v?.toBase58 === "function") return v.toBase58();
  if (Array.isArray(v)) return v.map(plainify);
  if (typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, plainify(x)]));
  return v;
}

const pk = (s: string) => new PublicKey(s);
const songIdBytes = (s: string): number[] => {
  const b = Buffer.alloc(32);
  b.write(s);
  return Array.from(b);
};
const jur = (code: string): number[] => {
  const c = (code || "").toUpperCase().padEnd(2, " ").slice(0, 2);
  return [c.charCodeAt(0), c.charCodeAt(1)];
};
/** Coerce a caller-supplied reference into a fixed 64-byte array (base64 string, number[], or text). */
const ref64 = (r: unknown): number[] => {
  const b = Buffer.alloc(64);
  if (Array.isArray(r)) Buffer.from(r).copy(b);
  else if (typeof r === "string") Buffer.from(r, "base64").copy(b);
  return Array.from(b);
};

// ---------------- reads ----------------
export const readConfig = async () => plainify(await getGlobalConfig(read));
export const readListings = async () =>
  plainify(await read.account.songListing.all()).map((x: any) => ({ address: x.publicKey, ...x.account }));
export const readListing = async (listing: string) => plainify(await getListing(read, pk(listing)));
export const readIdentity = async (user: string) => plainify(await getIdentity(read, pk(user)));
export const readPosition = async (mint: string, owner: string) =>
  plainify(await getPosition(read, pk(mint), pk(owner)));

// ---------------- writes ----------------

/** Deploy-once bootstrap. `secret` must be the program's upgrade authority. */
export async function initializeGlobal(body: any) {
  const { royalty, kp } = await resolveActor(body);
  const [programData] = PublicKey.findProgramAddressSync(
    [ROYALTY_SHARES_PROGRAM_ID.toBuffer()],
    BPF_LOADER_UPGRADEABLE,
  );
  const signature = await send(royalty.methods
    .initializeGlobal({
      complianceAuthority: pk(body.complianceAuthority),
      treasury: pk(body.treasury),
      // Recorded settlement-currency reference only; no SBTS is moved on-chain.
      sbstMint: config.sbtsMint,
      platformFeeBps: Number(body.platformFeeBps ?? 200),
      maxGlobalOwnershipBps: Number(body.maxGlobalOwnershipBps ?? 10000),
    })
    .accountsPartial({
      authority: kp.publicKey,
      globalConfig: globalConfigPda(),
      program: ROYALTY_SHARES_PROGRAM_ID,
      programData,
      systemProgram: SystemProgram.programId,
    }), kp);
  return { signature, globalConfig: globalConfigPda().toBase58() };
}

const ROLES = ["investor", "artist", "both"] as const;
function roleVariant(role: string) {
  const r = String(role ?? "").toLowerCase();
  if (!ROLES.includes(r as (typeof ROLES)[number])) {
    throw new ApiError(400, `role must be one of ${ROLES.join(", ")}`);
  }
  return { [r]: {} } as any;
}

/**
 * User onboarding: create the platform profile (role + counters). Signed by the user — with
 * custodial keys the backend can do this at signup with no user interaction.
 * `payerSecret` optionally funds the rent from a platform key instead of the user's.
 */
export async function createUserProfile(body: any) {
  const { royalty, kp } = await resolveActor(body);
  const payer = body.payerSecret ? Keypair.fromSecretKey(Uint8Array.from(body.payerSecret)) : kp;
  const profile = userProfilePda(kp.publicKey);
  const ix = await royalty.methods
    .createUserProfile(roleVariant(body.role))
    .accountsPartial({
      payer: payer.publicKey,
      user: kp.publicKey,
      profile,
      systemProgram: SystemProgram.programId,
    })
    .instruction();
  // The user must sign even when the platform pays the rent.
  const signature = await submit([ix], payer.publicKey.equals(kp.publicKey) ? [] : [kp], payer, {
    computeUnitLimit: 800_000,
  });
  return { signature, profile: profile.toBase58(), user: kp.publicKey.toBase58(), role: body.role };
}

/** Change your own role (signer = the profile owner). */
export async function updateUserRole(body: any) {
  const { royalty, kp } = await resolveActor(body);
  const signature = await send(
    royalty.methods
      .updateUserRole(roleVariant(body.role))
      .accountsPartial({ user: kp.publicKey, profile: userProfilePda(kp.publicKey) }),
    kp,
  );
  return { signature, role: body.role };
}

/** Adjust the platform fee in basis points (signer = ops authority). */
export async function updatePlatformFee(body: any) {
  const { royalty, kp } = await resolveActor(body);
  const signature = await send(
    royalty.methods
      .updatePlatformFee(Number(body.platformFeeBps))
      .accountsPartial({ authority: kp.publicKey, globalConfig: globalConfigPda() }),
    kp,
  );
  return { signature, platformFeeBps: Number(body.platformFeeBps) };
}

/** Read a wallet's platform profile. */
export const readProfile = async (user: string) =>
  plainify(await read.account.userProfile.fetch(userProfilePda(pk(user))));

const STATUSES = ["ok", "restricted", "frozen"] as const;
function statusVariant(status: unknown) {
  const s = String(status ?? "ok").toLowerCase();
  if (!STATUSES.includes(s as (typeof STATUSES)[number])) {
    throw new ApiError(400, `status must be one of ${STATUSES.join(", ")}`);
  }
  return { [s]: {} } as any;
}

/**
 * Claim a public username for a wallet.
 *
 * Uniqueness is enforced on-chain by the PDA, so a taken name surfaces as a failed
 * simulation rather than a race here. `payerSecret` lets the platform fund the rent while
 * the user's own key still signs — publishing a handle against an address is a privacy
 * decision, so it needs their signature.
 */
export async function claimUsername(body: any) {
  const { royalty, kp } = await resolveActor(body);
  let username: string;
  try {
    username = assertUsername(body.username);
  } catch (e: any) {
    throw new ApiError(400, e.message);
  }
  const payer = body.payerSecret ? Keypair.fromSecretKey(Uint8Array.from(body.payerSecret)) : kp;
  const ix = await royalty.methods
    .claimUsername(username)
    .accountsPartial({
      payer: payer.publicKey,
      user: kp.publicKey,
      profile: userProfilePda(kp.publicKey),
      usernameRecord: usernamePda(username),
      systemProgram: SystemProgram.programId,
    })
    .instruction();
  const signature = await submit([ix], payer.publicKey.equals(kp.publicKey) ? [] : [kp], payer, {
    computeUnitLimit: 800_000,
  });
  return { signature, username, record: usernamePda(username).toBase58() };
}

/** Give up a username, closing the claim record (rent refunded) and freeing the name. */
export async function releaseUsername(body: any) {
  const { royalty, kp } = await resolveActor(body);
  const username = String(body.username ?? "");
  const signature = await send(
    royalty.methods.releaseUsername(username).accountsPartial({
      user: kp.publicKey,
      profile: userProfilePda(kp.publicKey),
      usernameRecord: usernamePda(username),
    }),
    kp,
  );
  return { signature, username };
}

/** Look up who owns a username. Returns `null` when the name is unclaimed. */
export async function readUsername(username: string) {
  const record = usernamePda(username);
  const acct = await read.account.usernameRecord.fetchNullable(record);
  return acct ? { username, record: record.toBase58(), ...plainify(acct) } : null;
}

/**
 * Register / update a wallet's KYC record (signer = compliance authority).
 *
 * `pii` (the full personal record) is hashed here and **only the hash is sent on-chain**.
 * The caller must persist the returned `salt` and the exact `pii` object — without both,
 * the commitment can never be re-derived and the record becomes unverifiable. Pass
 * `piiCommitment` directly instead if the hashing already happened upstream.
 */
export async function registerIdentity(body: any) {
  const { royalty, kp } = await resolveActor(body);
  const user = pk(body.user);

  let salt: Buffer | undefined;
  let commitment: number[] | null = null;
  if (body.pii) {
    salt = body.salt ? Buffer.from(body.salt, "base64") : newSalt();
    commitment = toBytes32(commit(body.pii, salt));
  } else if (body.piiCommitment) {
    commitment = Array.from(Buffer.from(body.piiCommitment, "base64"));
    if (commitment.length !== 32) throw new ApiError(400, "piiCommitment must be 32 bytes (base64)");
  }

  const signature = await send(royalty.methods
    .registerIdentity({
      kycLevel: Number(body.kycLevel ?? 2),
      jurisdiction: jur(body.jurisdiction ?? "GB"),
      status: statusVariant(body.status),
      accredited: body.accredited ?? true,
      piiCommitment: commitment,
    })
    .accountsPartial({
      complianceAuthority: kp.publicKey,
      globalConfig: globalConfigPda(),
      user,
      identity: identityPda(user),
    }), kp);
  return {
    signature,
    identity: identityPda(user).toBase58(),
    // Returned once, never stored by this service. Persist it encrypted against the user
    // row — losing it makes the commitment unverifiable; leaking it makes the PII
    // brute-forceable. Deleting it later is the right-to-erasure mechanism.
    salt: salt ? salt.toString("base64") : undefined,
    piiCommitment: commitment ? Buffer.from(commitment).toString("base64") : undefined,
  };
}

/**
 * Re-commit a user's PII after re-verification, leaving their compliance status alone.
 *
 * Separate from `registerIdentity` on purpose: restating `status` on every KYC refresh
 * would put an accidental unfreeze one stale field away.
 */
export async function setPiiCommitment(body: any) {
  const { royalty, kp } = await resolveActor(body);
  const user = pk(body.user);
  const salt = body.salt ? Buffer.from(body.salt, "base64") : newSalt();
  const commitment = body.pii
    ? commit(body.pii, salt)
    : Buffer.from(String(body.piiCommitment ?? ""), "base64");
  if (commitment.length !== 32) throw new ApiError(400, "supply either `pii` or a 32-byte `piiCommitment`");

  const signature = await send(
    royalty.methods.setPiiCommitment(toBytes32(commitment)).accountsPartial({
      complianceAuthority: kp.publicKey,
      globalConfig: globalConfigPda(),
      identity: identityPda(user),
    }),
    kp,
  );
  return {
    signature,
    salt: body.pii ? salt.toString("base64") : undefined,
    piiCommitment: commitment.toString("base64"),
  };
}

/** Artist creates a listing (signer = artist). Returns the derived listing + share mint. */
export async function createListing(body: any) {
  const { royalty, kp } = await resolveActor(body);
  const songId = songIdBytes(String(body.songId));
  const listing = listingPda(kp.publicKey, Uint8Array.from(songId));
  const shareMint = shareMintPda(listing);
  const signature = await send(royalty.methods
    .createListing({
      songId,
      metadataUri: String(body.metadataUri ?? ""),
      totalShares: new BN(String(body.totalShares)),
      pricePerShare: new BN(String(body.pricePerShare)),
      royaltyPercentSold: Number(body.royaltyPercentSold ?? 5000),
      artistRetainedPercent: Number(body.artistRetainedPercent ?? 5000),
      startTime: new BN(String(body.startTime ?? 0)),
      endTime: body.endTime != null ? new BN(String(body.endTime)) : null,
      lockupSeconds: new BN(String(body.lockupSeconds ?? 0)),
      requiresAccredited: !!body.requiresAccredited,
      allowedJurisdictions: (body.allowedJurisdictions ?? []).map((c: string) => jur(c)),
      maxSharesPerWallet: new BN(String(body.maxSharesPerWallet ?? 0)),
    })
    .accountsPartial({
      artist: kp.publicKey,
      globalConfig: globalConfigPda(),
      artistProfile: userProfilePda(kp.publicKey),
      listing,
      shareMint,
      complianceConfig: compliancePda(shareMint),
      transferHookProgram: TRANSFER_HOOK_PROGRAM_ID,
      token2022Program: TOKEN_2022_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    }), kp);
  return { signature, listing: listing.toBase58(), shareMint: shareMint.toBase58() };
}

/** Initialize the transfer-hook resolver for a listing's mint (call once, before secondary transfers). */
export async function initHookMetas(body: any) {
  const { hook, kp } = await resolveActor(body);
  const shareMint = pk(body.shareMint);
  const signature = await send(hook.methods
    .initializeExtraAccountMetaList()
    .accountsPartial({
      payer: kp.publicKey,
      extraAccountMetaList: extraAccountMetaListPda(shareMint),
      mint: shareMint,
      systemProgram: SystemProgram.programId,
    }), kp);
  return { signature, extraAccountMetaList: extraAccountMetaListPda(shareMint).toBase58() };
}

/**
 * Primary issuance (signer = buyer). **Moves no money** — the API must have settled payment
 * off-chain first; `settlementAmount` (minor units) and `paymentTxHash` are recorded on the
 * trade as the audit reference. Mints the shares and writes the `TradeRecord`.
 */
export async function buyShares(body: any) {
  const { royalty, kp } = await resolveActor(body);
  const listing = pk(body.listing);
  const l: any = await getListing(read, listing);
  const shareMint = l.shareMint as PublicKey;
  const tradeIndex = BigInt(l.totalTrades.toString());
  const settlement = new BN(String(body.settlementAmount ?? body.pricePaid ?? 0));

  const signature = await send(royalty.methods
    .buyShares(new BN(String(body.shares)), settlement, body.paymentTxHash ?? Array(64).fill(0))
    .accountsPartial({
      buyer: kp.publicKey,
      globalConfig: globalConfigPda(),
      listing,
      buyerProfile: userProfilePda(kp.publicKey),
      buyerIdentity: identityPda(kp.publicKey),
      complianceConfig: compliancePda(shareMint),
      shareMint,
      buyerShareAta: shareAta(shareMint, kp.publicKey),
      position: positionPda(shareMint, kp.publicKey),
      tradeRecord: tradeRecordPda(listing, tradeIndex),
      token2022Program: TOKEN_2022_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    }), kp);
  return { signature, shares: String(body.shares), buyer: kp.publicKey.toBase58() };
}

/**
 * Record a royalty distribution paid **off-chain** (signer = ops authority).
 *
 * The platform computes each holder's cut from their live token balance and pays them via
 * its own rails, then calls this to put the event on the ledger. `merkleRoot` (base64, 32
 * bytes) optionally commits to the per-holder payout list; `reference` is an off-chain
 * batch id. No funds move on-chain.
 */
export async function recordDistribution(body: any) {
  const { royalty, kp } = await resolveActor(body);
  const listing = pk(body.listing);
  const merkleRoot = body.merkleRoot
    ? Array.from(Buffer.from(body.merkleRoot, "base64"))
    : Array(32).fill(0);
  if (merkleRoot.length !== 32) throw new ApiError(400, "merkleRoot must be 32 bytes (base64)");
  const reference = ref64(body.reference);
  const l: any = await getListing(read, listing);
  const index = BigInt(l.totalDistributions.toString());

  const signature = await send(royalty.methods
    .recordDistribution(new BN(String(body.totalAmount)), merkleRoot, reference)
    .accountsPartial({
      authority: kp.publicKey,
      globalConfig: globalConfigPda(),
      listing,
      distribution: distributionPda(listing, index),
      systemProgram: SystemProgram.programId,
    }), kp);
  return { signature, distribution: distributionPda(listing, index).toBase58(), index: index.toString() };
}

/** All recorded distributions for a listing (audit trail; the payouts happened off-chain). */
export async function readDistributions(listing: string) {
  const all = await read.account.distributionRecord.all([
    { memcmp: { offset: 8, bytes: pk(listing).toBase58() } },
  ]);
  return plainify(all)
    .map((x: any) => ({ address: x.publicKey, ...x.account }))
    .sort((a: any, b: any) => Number(a.index) - Number(b.index));
}

// ---------------- secondary sale (compliant transfer + on-chain trade record) ----------------

/**
 * Execute a **secondary sale**: move shares seller→buyer and record the trade **on-chain**, in one
 * atomic transaction. The seller initiates from the frontend; the custodial backend signs here.
 *
 * The transaction is `[create buyer ATA (idempotent), transferChecked(hook-gated), record_secondary_trade]`.
 * The record instruction introspects the tx and fails unless the matching transfer is present — so
 * the on-chain ledger entry is bound to a real transfer, never just asserted. `settlementAmount` is
 * the off-chain price, recorded as data (no money moves on-chain).
 */
export async function transferShares(body: any) {
  const { royalty, kp } = await resolveActor(body); // seller (transfer authority + payer)
  const listing = pk(body.listing);
  const buyer = pk(body.buyer);
  const l: any = await getListing(read, listing);
  const shareMint = l.shareMint as PublicKey;
  const shares = BigInt(String(body.shares));
  const settlement = new BN(String(body.settlementAmount ?? 0));
  const tradeIndex = BigInt(l.totalTrades.toString());

  const src = shareAta(shareMint, kp.publicKey);
  const dst = shareAta(shareMint, buyer);

  // The hook resolver reads the destination ATA when building the transfer, so ensure it exists
  // first (its own tx — creating an ATA has no ledger meaning). Idempotent if already present.
  await submit(
    [createAssociatedTokenAccountIdempotentInstruction(kp.publicKey, dst, buyer, shareMint, TOKEN_2022_PROGRAM_ID)],
    [], kp, { computeUnitLimit: 200_000 },
  );

  // Resolves the transfer hook's extra accounts (compliance runs on send).
  const transferIx = await createTransferCheckedWithTransferHookInstruction(
    connection, src, shareMint, dst, kp.publicKey, shares, 0, [], "confirmed", TOKEN_2022_PROGRAM_ID,
  );
  const recordIx = await royalty.methods
    .recordSecondaryTrade(new BN(shares.toString()), settlement, body.paymentTxHash ?? Array(64).fill(0))
    .accountsPartial({
      seller: kp.publicKey,
      listing,
      buyer,
      tradeRecord: tradeRecordPda(listing, tradeIndex),
      instructions: SYSVAR_INSTRUCTIONS_PUBKEY,
      systemProgram: SystemProgram.programId,
    })
    .instruction();

  // transfer + record land atomically: a recorded trade always has a real transfer behind it.
  const signature = await submit([transferIx, recordIx], [], kp, { computeUnitLimit: 800_000 });
  return { signature, listing: listing.toBase58(), seller: kp.publicKey.toBase58(), buyer: buyer.toBase58(), shares: shares.toString() };
}

// ---------------- trade history (authoritative on-chain ledger + reconciliation) ----------------

/** Enumerate every listing's share mint for the indexer to walk. */
const listingSource = async () =>
  (await read.account.songListing.all()).map((x: any) => ({
    listing: x.publicKey.toBase58(),
    mint: x.account.shareMint as PublicKey,
  }));

/**
 * Shared indexer instance — a reconciliation/scale layer (see docs/architecture.md). Lazily built so the
 * durable store (Postgres, when configured) can connect + create its schema before first use.
 */
let _indexer: Indexer | null = null;
export async function getIndexer(): Promise<Indexer> {
  if (!_indexer) _indexer = new Indexer(connection, await getStore(), listingSource);
  return _indexer;
}

/** Every on-chain `TradeRecord` for a listing (primary + secondary), the authoritative history. */
async function allTradeRecords(listing: PublicKey) {
  const all = await read.account.tradeRecord.all([
    { memcmp: { offset: 8, bytes: listing.toBase58() } },
  ]);
  return plainify(all).map((x: any) => ({ address: x.publicKey, ...x.account }));
}

const isSecondary = (t: any) => t.tradeType?.secondary !== undefined;

/**
 * Authoritative on-chain trade history for a listing: primary sales (`buy_shares`) and secondary
 * sales (`record_secondary_trade`) share one `["trade", listing, index]` space, so this is the
 * complete ordered ledger from primary through secondary — read straight from the chain.
 */
export async function readTrades(listingStr: string) {
  const listing = pk(listingStr);
  return (await allTradeRecords(listing))
    .map((t: any) => ({
      kind: isSecondary(t) ? ("secondary" as const) : ("primary" as const),
      seller: t.from,
      buyer: t.to,
      shares: t.sharesAmount,
      settlementAmount: t.settlementAmount,
      timestamp: Number(t.timestamp),
    }))
    .sort((a: { timestamp: number }, b: { timestamp: number }) => a.timestamp - b.timestamp);
}

/**
 * Reconciliation / audit safety net: reconstruct raw share transfers from token movements (the
 * indexer) and flag any that are **not** backed by an on-chain secondary `TradeRecord`. In the
 * normal flow every resale goes through `transferShares` (transfer + record atomically), so this
 * should be empty; a non-empty result means a share moved without being recorded (e.g. a direct
 * transfer that bypassed the API) and needs investigation.
 */
export async function reconcileTrades(listingStr: string) {
  const listing = pk(listingStr);
  const l: any = await getListing(read, listing);
  const store = await getStore();
  await (await getIndexer()).indexMint({ listing: listingStr, mint: l.shareMint as PublicKey });

  const key = (s: string, b: string, a: string) => `${s}|${b}|${a}`;
  const counts = new Map<string, number>();
  for (const t of (await allTradeRecords(listing)).filter(isSecondary)) {
    const k = key(t.from, t.to, String(t.sharesAmount));
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const rawMoves = await store.listTrades({ listing: listingStr });
  const unrecorded = rawMoves.filter((m) => {
    const k = key(m.seller, m.buyer, String(m.amount));
    const c = counts.get(k) ?? 0;
    if (c > 0) { counts.set(k, c - 1); return false; }
    return true;
  });
  return { rawMoves: rawMoves.length, onchainSecondary: rawMoves.length - unrecorded.length, unrecorded };
}

// ---------------- admin ----------------
async function complianceOp(body: any, fn: (m: any, cc: PublicKey) => any) {
  const { royalty, kp } = await resolveActor(body);
  const shareMint = pk(body.shareMint);
  const signature = await send(fn(royalty.methods, compliancePda(shareMint))
    .accountsPartial({
      complianceAuthority: kp.publicKey,
      globalConfig: globalConfigPda(),
      complianceConfig: compliancePda(shareMint),
    }), kp);
  return { signature };
}
export const blockUser = (body: any) => complianceOp(body, (m) => m.blockUser(pk(body.user)));
export const unblockUser = (body: any) => complianceOp(body, (m) => m.unblockUser(pk(body.user)));
export const updateCompliance = (body: any) =>
  complianceOp(body, (m) => m.updateCompliance(new BN(String(body.maxSharesPerWallet ?? 0))));

export async function setListingStatus(body: any) {
  const { royalty, kp } = await resolveActor(body);
  const status = String(body.status).toLowerCase();
  const variants = ["pending", "active", "soldOut", "paused", "closed"];
  const key = variants.find((v) => v.toLowerCase() === status);
  if (!key) throw new ApiError(400, `status must be one of ${variants.join(", ")}`);
  const signature = await send(royalty.methods
    .setListingStatus({ [key]: {} } as any)
    .accountsPartial({ authority: kp.publicKey, globalConfig: globalConfigPda(), listing: pk(body.listing) }), kp);
  return { signature };
}

export async function setGlobalPause(body: any) {
  const { royalty, kp } = await resolveActor(body);
  const signature = await send(royalty.methods
    .setGlobalPause(!!body.paused)
    .accountsPartial({ authority: kp.publicKey, globalConfig: globalConfigPda() }), kp);
  return { signature };
}
