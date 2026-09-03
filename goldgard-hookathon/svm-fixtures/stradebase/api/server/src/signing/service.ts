/**
 * Reference custody signer service — a standalone HTTP service that holds signing keys and signs
 * transaction messages on request. The API talks to it via `HttpSignBackend`; the raw private key
 * never leaves this process.
 *
 * This is the **reference** shape of a custody service, not production custody: it keeps keys in
 * memory in an `InProcessVault`. The backend team swaps that for a KMS/HSM/MPC-backed
 * `SignBackend` (and adds authN/Z, audit logging, and signing policy) — the HTTP contract stays.
 *
 *   POST /keys        { secret?: number[] }              -> { keyRef, publicKey }   (import or mint)
 *   GET  /keys/:ref                                       -> { publicKey }
 *   POST /sign        { keyRef, message: base64 }         -> { signature: base64 }
 *
 * Run standalone with `pnpm --filter @stradebase/api signer` (see `service-main.ts`), or embed the
 * app in a test.
 */
import express, { type Express } from "express";
import { Keypair } from "@solana/web3.js";
import { InProcessVault } from "./signer.js";

export function createSignerApp(vault = new InProcessVault()): Express {
  const app = express();
  app.use(express.json({ limit: "256kb" }));

  // Import a keypair (JSON secret-key array) or mint a fresh one; returns an opaque keyRef.
  app.post("/keys", (req, res) => {
    try {
      const secret = req.body?.secret;
      const kp = Array.isArray(secret) ? Keypair.fromSecretKey(Uint8Array.from(secret)) : Keypair.generate();
      res.status(201).json(vault.register(kp));
    } catch (e: any) {
      res.status(400).json({ error: e?.message ?? "invalid key" });
    }
  });

  app.get("/keys/:ref", async (req, res) => {
    try {
      const publicKey = (await vault.getPublicKey(req.params.ref)).toBase58();
      res.json({ publicKey });
    } catch {
      res.status(404).json({ error: "unknown keyRef" });
    }
  });

  // Sign a base64 transaction message; returns the base64 signature. Never returns key material.
  app.post("/sign", async (req, res) => {
    try {
      const { keyRef, message } = req.body ?? {};
      if (typeof keyRef !== "string" || typeof message !== "string") {
        return res.status(400).json({ error: "keyRef and message (base64) are required" });
      }
      // A real service enforces signing policy HERE (rate/amount/destination limits, anomaly
      // detection) before signing, and writes an audit log entry.
      const sig = await vault.sign(keyRef, new Uint8Array(Buffer.from(message, "base64")));
      res.json({ signature: Buffer.from(sig).toString("base64") });
    } catch (e: any) {
      res.status(400).json({ error: e?.message ?? "sign failed" });
    }
  });

  app.get("/health", (_req, res) => res.json({ ok: true }));
  return app;
}
