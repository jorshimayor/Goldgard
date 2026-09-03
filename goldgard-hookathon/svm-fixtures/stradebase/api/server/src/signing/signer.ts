/**
 * Signer abstraction — the custody seam.
 *
 * Every on-chain write in this service funnels through `tx/engine.ts::submit`, which no longer
 * signs with a raw `Keypair`. Instead it signs through this `TxSigner` interface: "given the
 * serialized transaction message, return a 64-byte ed25519 signature." That one indirection is
 * what lets the **backend team** move signing into a hardened custody system (KMS / HSM / MPC /
 * TSS) without touching any Solana/ledger code — they implement `TxSigner` and hand it to the
 * engine; nothing else changes.
 *
 * This file ships one implementation, `LocalKeypairSigner`, which keeps the current behavior
 * (sign locally with an in-memory keypair) for dev and tests. **It is not the production custody
 * story** — see `docs/backend-handover.md` for the KMS/MPC handoff and a `RemoteSigner` sketch.
 *
 * Why message-based (not `keypair.secretKey`): a hardware/MPC signer never exposes a secret key.
 * Signing the message bytes and attaching the signature (`Transaction.addSignature`) is the only
 * shape that works for both local keypairs and remote signers, so the engine speaks that shape.
 */
import { createPrivateKey, type KeyObject, sign as edSign } from "node:crypto";
import { type Keypair, PublicKey } from "@solana/web3.js";

/** What the engine needs from anything that can authorize a transaction. */
export interface TxSigner {
  /** The account whose signature this produces. */
  readonly publicKey: PublicKey;
  /**
   * Sign the serialized transaction message (`Transaction.serializeMessage()`), returning the
   * raw 64-byte ed25519 signature. Async so a remote KMS/MPC call fits the same shape.
   */
  signMessage(message: Uint8Array): Promise<Uint8Array>;
}

// RFC 8410 PKCS#8 prefix for an Ed25519 private key, followed by the 32-byte seed. Lets Node's
// built-in crypto sign with a web3.js keypair — no third-party crypto dependency.
const ED25519_PKCS8_PREFIX = Buffer.from("302e020100300506032b657004220420", "hex");

/**
 * Signs with an in-memory keypair via Node's built-in ed25519. Behaviorally identical to the old
 * `tx.sign(keypair)` path. Use for dev/tests and platform fee-payers; **not** for custodial user
 * keys in production (that's what the KMS/MPC `TxSigner` in `docs/backend-handover.md` replaces).
 */
export class LocalKeypairSigner implements TxSigner {
  readonly publicKey: PublicKey;
  readonly #key: KeyObject;

  constructor(keypair: Keypair) {
    this.publicKey = keypair.publicKey;
    const seed = Buffer.from(keypair.secretKey.slice(0, 32)); // web3 secretKey = seed(32) || pubkey(32)
    this.#key = createPrivateKey({
      key: Buffer.concat([ED25519_PKCS8_PREFIX, seed]),
      format: "der",
      type: "pkcs8",
    });
  }

  async signMessage(message: Uint8Array): Promise<Uint8Array> {
    // For Ed25519, Node's `sign` takes a null algorithm and returns the 64-byte signature.
    return edSign(null, Buffer.from(message), this.#key);
  }
}

/** True if `x` already implements `TxSigner` (has `signMessage`), vs. being a raw `Keypair`. */
function isTxSigner(x: TxSigner | Keypair): x is TxSigner {
  return typeof (x as TxSigner).signMessage === "function";
}

/** Accept either a `TxSigner` or a raw `Keypair`; always return a `TxSigner`. */
export function toSigner(x: TxSigner | Keypair): TxSigner {
  return isTxSigner(x) ? x : new LocalKeypairSigner(x);
}

// ---------------- custody backend (remote signing) ----------------

/**
 * A custody backend that holds keys by opaque `keyRef` and signs on their behalf — the shape a
 * KMS/HSM/MPC provider exposes. The raw private key never crosses this boundary.
 */
export interface SignBackend {
  /** The public key for a `keyRef` (so callers can set fee payer / account metas). */
  getPublicKey(keyRef: string): Promise<PublicKey>;
  /** ed25519-sign `message` with the key identified by `keyRef` → 64-byte signature. */
  sign(keyRef: string, message: Uint8Array): Promise<Uint8Array>;
}

/** A `TxSigner` whose key lives in a `SignBackend` (custody service) — production shape. */
export class RemoteSigner implements TxSigner {
  constructor(
    readonly publicKey: PublicKey,
    private readonly keyRef: string,
    private readonly backend: SignBackend,
  ) {}
  signMessage(message: Uint8Array): Promise<Uint8Array> {
    return this.backend.sign(this.keyRef, message);
  }
}

/**
 * Reference in-process custody vault: holds keypairs by generated `keyRef` and signs with them,
 * never exposing the secret. Stands in for a KMS/MPC service — the signer service (`service.ts`)
 * wraps one, and the backend team swaps its guts for their provider. **Not** hardware-backed.
 */
export class InProcessVault implements SignBackend {
  #keys = new Map<string, LocalKeypairSigner>();
  #seq = 0;

  /** Import a keypair (or, with no arg, mint a fresh one) and return its opaque ref + pubkey. */
  register(keypair: Keypair): { keyRef: string; publicKey: string } {
    const keyRef = `key_${++this.#seq}_${keypair.publicKey.toBase58().slice(0, 8)}`;
    this.#keys.set(keyRef, new LocalKeypairSigner(keypair));
    return { keyRef, publicKey: keypair.publicKey.toBase58() };
  }

  #get(keyRef: string): LocalKeypairSigner {
    const s = this.#keys.get(keyRef);
    if (!s) throw new Error(`unknown keyRef: ${keyRef}`);
    return s;
  }
  async getPublicKey(keyRef: string) {
    return this.#get(keyRef).publicKey;
  }
  async sign(keyRef: string, message: Uint8Array) {
    return this.#get(keyRef).signMessage(message);
  }
}

/** `SignBackend` client for the HTTP signer service (`service.ts`). Uses global `fetch`. */
export class HttpSignBackend implements SignBackend {
  constructor(private readonly baseUrl: string) {}

  async getPublicKey(keyRef: string): Promise<PublicKey> {
    const res = await fetch(`${this.baseUrl}/keys/${encodeURIComponent(keyRef)}`);
    if (!res.ok) throw new Error(`signer service getPublicKey failed: ${res.status}`);
    const { publicKey } = (await res.json()) as { publicKey: string };
    return new PublicKey(publicKey);
  }

  async sign(keyRef: string, message: Uint8Array): Promise<Uint8Array> {
    const res = await fetch(`${this.baseUrl}/sign`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ keyRef, message: Buffer.from(message).toString("base64") }),
    });
    if (!res.ok) throw new Error(`signer service sign failed: ${res.status}`);
    const { signature } = (await res.json()) as { signature: string };
    return new Uint8Array(Buffer.from(signature, "base64"));
  }
}
