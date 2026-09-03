/**
 * Resolve the `TxSigner` for a request — the single place the API decides *how* to sign.
 *
 * Two modes:
 *   - **dev/testing:** the request carries `secret` (a JSON secret-key array) → a `LocalKeypairSigner`.
 *   - **custody:** the request carries `keyRef` (an opaque handle) → a `RemoteSigner` backed by the
 *     configured custody service (`SIGNER_URL`). The raw key never reaches this process.
 *
 * Production runs custody mode: the backend resolves `keyRef` from the authenticated user (never
 * trusting a `keyRef` from the client blindly) and points `SIGNER_URL` at the real KMS/MPC service.
 */
import { Keypair } from "@solana/web3.js";
import { config } from "../config.js";
import { ApiError } from "../http.js";
import { HttpSignBackend, LocalKeypairSigner, RemoteSigner, type SignBackend, type TxSigner } from "./signer.js";

let backend: SignBackend | null = null;
function custodyBackend(): SignBackend {
  if (!config.signerUrl) {
    throw new ApiError(500, "keyRef signing requires SIGNER_URL (the custody service)");
  }
  if (!backend) backend = new HttpSignBackend(config.signerUrl);
  return backend;
}

/** Resolve the signer for a write request from its `keyRef` (custody) or `secret` (dev). */
export async function resolveSigner(body: any): Promise<TxSigner> {
  if (typeof body?.keyRef === "string") {
    const b = custodyBackend();
    return new RemoteSigner(await b.getPublicKey(body.keyRef), body.keyRef, b);
  }
  if (Array.isArray(body?.secret)) {
    return new LocalKeypairSigner(Keypair.fromSecretKey(Uint8Array.from(body.secret)));
  }
  throw new ApiError(400, "provide `secret` (dev) or `keyRef` (custody) to authorize the write");
}
