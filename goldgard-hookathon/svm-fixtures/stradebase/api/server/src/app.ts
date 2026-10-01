import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import { config } from "./config.js";
import { ApiError, asyncHandler, parsePubkey, parseString, parseUiAmount, sendJson } from "./http.js";
import { withIdempotency } from "./idempotency.js";
import { engineStats } from "./tx/engine.js";
import * as distribute from "./services/distribute.js";
import * as nfts from "./services/nfts.js";
import * as royalties from "./services/royalties.js";
import * as tokens from "./services/tokens.js";

/** Per-IP fixed-window rate limit (basic abuse protection; use a shared store behind replicas). */
const rlHits = new Map<string, { count: number; reset: number }>();
function rateLimit(req: Request, res: Response, next: NextFunction) {
  const ip = req.ip ?? "unknown";
  const now = Date.now();
  const e = rlHits.get(ip);
  if (!e || now > e.reset) {
    rlHits.set(ip, { count: 1, reset: now + 60_000 });
    return next();
  }
  if (e.count >= config.rateLimitPerMin) return sendJson(res, { error: "Rate limit exceeded" }, 429);
  e.count++;
  next();
}

/** Run a write behind the request's Idempotency-Key (dedupes retries during a burst). */
const idem = (req: Request, fn: () => Promise<unknown>) =>
  withIdempotency(req.header("Idempotency-Key") ?? undefined, fn);

/**
 * The unified Stradebase backend.
 *
 * | Method + path                     | Purpose                                          |
 * |-----------------------------------|--------------------------------------------------|
 * | GET  /health                      | liveness                                         |
 * | GET  /tokens                      | supported-token catalogue                        |
 * | GET  /balances/:owner             | all SBTS/USDC/USDT balances for a wallet          |
 * | GET  /balances/:owner/unified     | one SBTS (GBP) total across all tokens, formatted |
 * | GET  /balances/:owner/:symbol     | one token balance                                |
 * | GET  /history/:owner              | combined SBTS+USDC+USDT history (?limit)          |
 * | GET  /history/:owner/:symbol      | one token's transfer history (?limit&before)     |
 * | POST /mint                        | mint SBTS to a wallet         { to, amount }      |
 * | POST /transfer                    | transfer SBTS/USDC/USDT       { to, symbol, amount, fromSecret? } |
 * | POST /admin/freeze                | freeze a wallet's SBTS account { owner, symbol }  |
 * | POST /admin/thaw                  | thaw a wallet's SBTS account   { owner, symbol }  |
 * | POST /nfts/collection             | create an NFT collection      { name, uri }        |
 * | POST /nfts/mint                   | mint a Core NFT   { name, uri, owner?, collection? }|
 * | GET  /nfts/:asset                 | read an NFT (owner, uri, frozen)                   |
 * | POST /admin/nft/freeze            | freeze an NFT     { asset, collection? }           |
 * | POST /admin/nft/thaw              | thaw an NFT       { asset, collection? }           |
 */
export function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json());
  app.use(rateLimit);

  // Liveness + a peek at the transaction engine (in-flight, queue depth, fee-payer pool size).
  app.get("/health", (_req, res) => sendJson(res, { ok: true, engine: engineStats() }));

  app.get("/tokens", (_req, res) => sendJson(res, tokens.catalogue()));

  app.get(
    "/balances/:owner",
    asyncHandler(async (req, res) => {
      parsePubkey(req.params.owner, "owner");
      sendJson(res, await tokens.balances(req.params.owner));
    }),
  );

  app.get(
    "/balances/:owner/unified",
    asyncHandler(async (req, res) => {
      parsePubkey(req.params.owner, "owner");
      sendJson(res, await tokens.unifiedBalance(req.params.owner));
    }),
  );

  app.get(
    "/balances/:owner/:symbol",
    asyncHandler(async (req, res) => {
      parsePubkey(req.params.owner, "owner");
      sendJson(res, await tokens.balance(req.params.owner, req.params.symbol));
    }),
  );

  app.get(
    "/history/:owner",
    asyncHandler(async (req, res) => {
      parsePubkey(req.params.owner, "owner");
      const limit = req.query.limit ? Number(req.query.limit) : undefined;
      sendJson(res, await tokens.historyAll(req.params.owner, limit));
    }),
  );

  app.get(
    "/history/:owner/:symbol",
    asyncHandler(async (req, res) => {
      parsePubkey(req.params.owner, "owner");
      const limit = req.query.limit ? Number(req.query.limit) : undefined;
      const before = req.query.before ? String(req.query.before) : undefined;
      sendJson(res, await tokens.history(req.params.owner, req.params.symbol, limit, before));
    }),
  );

  app.post(
    "/mint",
    asyncHandler(async (req, res) => {
      parsePubkey(req.body?.to, "to");
      const amount = parseUiAmount(req.body?.amount);
      sendJson(res, await idem(req, () => tokens.mintSbts(req.body.to, amount)), 201);
    }),
  );

  app.post(
    "/transfer",
    asyncHandler(async (req, res) => {
      parsePubkey(req.body?.to, "to");
      const amount = parseUiAmount(req.body?.amount);
      const fromSecret = req.body?.fromSecret;
      if (fromSecret !== undefined && !Array.isArray(fromSecret)) {
        throw new ApiError(400, "fromSecret must be a JSON secret-key array or omitted");
      }
      sendJson(
        res,
        await idem(req, () => tokens.transfer({ to: req.body.to, symbol: req.body.symbol, uiAmount: amount, fromSecret })),
        201,
      );
    }),
  );

  app.post(
    "/admin/freeze",
    asyncHandler(async (req, res) => {
      parsePubkey(req.body?.owner, "owner");
      sendJson(res, await tokens.freeze(req.body.owner, req.body.symbol), 201);
    }),
  );

  app.post(
    "/admin/thaw",
    asyncHandler(async (req, res) => {
      parsePubkey(req.body?.owner, "owner");
      sendJson(res, await tokens.thaw(req.body.owner, req.body.symbol), 201);
    }),
  );

  // ----- Bulk SBTS distribution (sale/drop: pre-mint then pooled transfers) -----
  app.post(
    "/distribute/prefund",
    asyncHandler(async (req, res) => {
      const amountEach = parseUiAmount(req.body?.amountEach);
      sendJson(res, await idem(req, () => distribute.prefundPool(amountEach)), 201);
    }),
  );

  app.post(
    "/distribute",
    asyncHandler(async (req, res) => {
      if (!Array.isArray(req.body?.recipients)) {
        throw new ApiError(400, "recipients must be an array of { to, amount }");
      }
      sendJson(res, await idem(req, () => distribute.distribute(req.body.recipients)), 201);
    }),
  );

  // ----- NFTs (Metaplex Core) -----
  app.post(
    "/nfts/collection",
    asyncHandler(async (req, res) => {
      const name = parseString(req.body?.name, "name");
      const uri = parseString(req.body?.uri, "uri");
      sendJson(res, await nfts.createNftCollection(name, uri), 201);
    }),
  );

  app.post(
    "/nfts/mint",
    asyncHandler(async (req, res) => {
      const name = parseString(req.body?.name, "name");
      const uri = parseString(req.body?.uri, "uri");
      if (req.body?.owner) parsePubkey(req.body.owner, "owner");
      if (req.body?.collection) parsePubkey(req.body.collection, "collection");
      sendJson(
        res,
        await nfts.mintNft({ name, uri, owner: req.body?.owner, collection: req.body?.collection }),
        201,
      );
    }),
  );

  app.get(
    "/nfts/:asset",
    asyncHandler(async (req, res) => {
      parsePubkey(req.params.asset, "asset");
      sendJson(res, await nfts.getNft(req.params.asset));
    }),
  );

  app.post(
    "/admin/nft/freeze",
    asyncHandler(async (req, res) => {
      parsePubkey(req.body?.asset, "asset");
      if (req.body?.collection) parsePubkey(req.body.collection, "collection");
      sendJson(res, await nfts.freezeNft(req.body.asset, req.body?.collection), 201);
    }),
  );

  app.post(
    "/admin/nft/thaw",
    asyncHandler(async (req, res) => {
      parsePubkey(req.body?.asset, "asset");
      if (req.body?.collection) parsePubkey(req.body.collection, "collection");
      sendJson(res, await nfts.thawNft(req.body.asset, req.body?.collection), 201);
    }),
  );

  // ---------------- royalty-shares program (fractional royalty ownership) ----------------
  // Reads
  app.get("/royalties/config", asyncHandler(async (_req, res) => sendJson(res, await royalties.readConfig())));
  app.get("/royalties/listings", asyncHandler(async (_req, res) => sendJson(res, await royalties.readListings())));
  app.get(
    "/royalties/listings/:listing",
    asyncHandler(async (req, res) => {
      parsePubkey(req.params.listing, "listing");
      sendJson(res, await royalties.readListing(req.params.listing));
    }),
  );
  app.get(
    "/royalties/identity/:user",
    asyncHandler(async (req, res) => {
      parsePubkey(req.params.user, "user");
      sendJson(res, await royalties.readIdentity(req.params.user));
    }),
  );
  app.get(
    "/royalties/profile/:user",
    asyncHandler(async (req, res) => {
      parsePubkey(req.params.user, "user");
      sendJson(res, await royalties.readProfile(req.params.user));
    }),
  );
  app.get(
    "/royalties/distributions/:listing",
    asyncHandler(async (req, res) => {
      parsePubkey(req.params.listing, "listing");
      sendJson(res, await royalties.readDistributions(req.params.listing));
    }),
  );
  app.get(
    "/royalties/trades/:listing",
    asyncHandler(async (req, res) => {
      parsePubkey(req.params.listing, "listing");
      sendJson(res, await royalties.readTrades(req.params.listing));
    }),
  );
  app.get(
    "/royalties/reconcile/:listing",
    asyncHandler(async (req, res) => {
      parsePubkey(req.params.listing, "listing");
      sendJson(res, await royalties.reconcileTrades(req.params.listing));
    }),
  );
  app.get(
    "/royalties/username/:name",
    asyncHandler(async (req, res) => sendJson(res, await royalties.readUsername(req.params.name))),
  );
  app.get(
    "/royalties/positions/:mint/:owner",
    asyncHandler(async (req, res) => {
      parsePubkey(req.params.mint, "mint");
      parsePubkey(req.params.owner, "owner");
      sendJson(res, await royalties.readPosition(req.params.mint, req.params.owner));
    }),
  );

  // Writes (each body carries a `secret` = the acting wallet's JSON secret-key array)
  const post = (path: string, fn: (body: any) => Promise<unknown>) =>
    app.post(path, asyncHandler(async (req, res) => sendJson(res, await idem(req, () => fn(req.body ?? {})), 201)));

  post("/royalties/init", royalties.initializeGlobal);
  post("/royalties/identity", royalties.registerIdentity);
  post("/royalties/profile", royalties.createUserProfile);
  post("/royalties/profile/role", royalties.updateUserRole);
  post("/royalties/username", royalties.claimUsername);
  post("/royalties/username/release", royalties.releaseUsername);
  post("/royalties/pii", royalties.setPiiCommitment);
  post("/royalties/listings", royalties.createListing);
  post("/royalties/hook-metas", royalties.initHookMetas);
  post("/royalties/buy", royalties.buyShares);
  post("/royalties/transfer", royalties.transferShares);
  post("/royalties/distribute", royalties.recordDistribution);
  post("/royalties/admin/block", royalties.blockUser);
  post("/royalties/admin/unblock", royalties.unblockUser);
  post("/royalties/admin/compliance", royalties.updateCompliance);
  post("/royalties/admin/listing-status", royalties.setListingStatus);
  post("/royalties/admin/pause", royalties.setGlobalPause);
  post("/royalties/admin/fee", royalties.updatePlatformFee);

  // 404 + centralized error rendering.
  app.use((_req, res) => sendJson(res, { error: "Not found" }, 404));
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const status = err instanceof ApiError ? err.status : 500;
    const message = err instanceof Error ? err.message : "Internal error";
    if (status >= 500) console.error(err);
    sendJson(res, { error: message }, status);
  });

  return app;
}
