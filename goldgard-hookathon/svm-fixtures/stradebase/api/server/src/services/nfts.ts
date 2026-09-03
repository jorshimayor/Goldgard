import { generateSigner, keypairIdentity, publicKey, type Umi } from "@metaplex-foundation/umi";
import { base58 } from "@metaplex-foundation/umi/serializers";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { fromWeb3JsKeypair } from "@metaplex-foundation/umi-web3js-adapters";
import {
  create,
  createCollection,
  fetchAsset,
  fetchCollection,
  mplCore,
  updatePlugin,
} from "@metaplex-foundation/mpl-core";

import { admin } from "../solana.js";
import { config } from "../config.js";

/**
 * Platform NFTs are Metaplex **Core** assets (single-account NFTs — cheap to mint, native
 * freeze support). Minting is a custodial/backend operation: the platform (the `admin` key)
 * is the update authority and the FreezeDelegate authority, so it can freeze/thaw any asset
 * it issued. Metadata JSON must be hosted (Arweave/IPFS/CDN) and its URL passed as `uri` —
 * the tier files under `assets/nft-metadata` are the source content to upload.
 */

let _umi: Umi | undefined;
/** Lazily build a umi instance signing as the platform admin. */
function umi(): Umi {
  if (!_umi) {
    // Convert the web3.js admin Keypair to a umi signer (identity + payer) via the official
    // adapter — deriving it from the raw secret-key bytes can yield a mismatched pubkey.
    // Use "confirmed" (umi defaults to "finalized", which lags on a test-validator and can
    // make a freshly-funded payer read as zero).
    _umi = createUmi(config.rpcUrl, "confirmed")
      .use(mplCore())
      .use(keypairIdentity(fromWeb3JsKeypair(admin)));
  }
  return _umi;
}

/** base58 signature string from a sendAndConfirm result. */
const sig = (r: { signature: Uint8Array }) => base58.deserialize(r.signature)[0];

/** Create a collection the platform's NFTs can belong to. */
export async function createNftCollection(name: string, uri: string) {
  const collection = generateSigner(umi());
  const res = await createCollection(umi(), { collection, name, uri }).sendAndConfirm(umi());
  return { collection: collection.publicKey.toString(), signature: sig(res) };
}

/**
 * Mint a Core NFT to `owner` (defaults to the platform). Attaches a FreezeDelegate whose
 * authority is the platform admin, so the platform can later freeze/thaw it.
 */
export async function mintNft(params: {
  name: string;
  uri: string;
  owner?: string;
  collection?: string;
}) {
  const asset = generateSigner(umi());
  const collection = params.collection
    ? await fetchCollection(umi(), publicKey(params.collection))
    : undefined;

  const res = await create(umi(), {
    asset,
    name: params.name,
    uri: params.uri,
    owner: params.owner ? publicKey(params.owner) : undefined,
    collection,
    plugins: [
      {
        type: "FreezeDelegate",
        frozen: false,
        authority: { type: "Address", address: umi().identity.publicKey },
      },
    ],
  }).sendAndConfirm(umi());

  return {
    asset: asset.publicKey.toString(),
    owner: params.owner ?? umi().identity.publicKey.toString(),
    collection: params.collection,
    signature: sig(res),
  };
}

/** Freeze or thaw an NFT via its FreezeDelegate (platform is the plugin authority). */
async function setNftFrozen(asset: string, frozen: boolean, collection?: string) {
  const res = await updatePlugin(umi(), {
    asset: publicKey(asset),
    collection: collection ? publicKey(collection) : undefined,
    plugin: { type: "FreezeDelegate", frozen },
  }).sendAndConfirm(umi());
  return { asset, frozen, signature: sig(res) };
}

export const freezeNft = (asset: string, collection?: string) =>
  setNftFrozen(asset, true, collection);
export const thawNft = (asset: string, collection?: string) =>
  setNftFrozen(asset, false, collection);

/** Read an NFT's on-chain state (owner, metadata, frozen flag). */
export async function getNft(asset: string) {
  const a = await fetchAsset(umi(), publicKey(asset));
  return {
    asset,
    owner: a.owner.toString(),
    name: a.name,
    uri: a.uri,
    // freezeDelegate is a derived plugin present at runtime; not on the generated type.
    frozen: (a as unknown as { freezeDelegate?: { frozen?: boolean } }).freezeDelegate?.frozen ?? false,
  };
}
