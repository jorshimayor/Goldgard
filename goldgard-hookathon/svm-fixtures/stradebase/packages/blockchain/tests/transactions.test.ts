import { describe, it, expect } from "vitest";
import { Keypair, type ParsedTransactionWithMeta } from "@solana/web3.js";
import { createTokenRegistry } from "../src/tokens.js";
import { extractTokenChanges } from "../src/transactions.js";

const SBTS_MINT = Keypair.generate().publicKey;
const registry = createTokenRegistry({ cluster: "mainnet-beta", sbtsMint: SBTS_MINT });

const senderAta = Keypair.generate().publicKey;
const receiverAta = Keypair.generate().publicKey;
const senderOwner = Keypair.generate().publicKey.toBase58();
const receiverOwner = Keypair.generate().publicKey.toBase58();

function fixture(overrides: Partial<{ err: unknown; mint: string }> = {}): ParsedTransactionWithMeta {
  const mint = overrides.mint ?? registry.USDC.mint.toBase58();
  return {
    slot: 123,
    blockTime: 1_750_000_000,
    transaction: {
      signatures: ["sig111"],
      message: {
        accountKeys: [
          { pubkey: senderAta, signer: false, writable: true },
          { pubkey: receiverAta, signer: false, writable: true },
        ],
        instructions: [],
        recentBlockhash: "hash",
      },
    },
    meta: {
      err: overrides.err ?? null,
      fee: 5000,
      preBalances: [],
      postBalances: [],
      preTokenBalances: [
        {
          accountIndex: 0,
          mint,
          owner: senderOwner,
          uiTokenAmount: { amount: "10000000", decimals: 6, uiAmount: 10, uiAmountString: "10" },
        },
        {
          accountIndex: 1,
          mint,
          owner: receiverOwner,
          uiTokenAmount: { amount: "0", decimals: 6, uiAmount: 0, uiAmountString: "0" },
        },
      ],
      postTokenBalances: [
        {
          accountIndex: 0,
          mint,
          owner: senderOwner,
          uiTokenAmount: { amount: "7500000", decimals: 6, uiAmount: 7.5, uiAmountString: "7.5" },
        },
        {
          accountIndex: 1,
          mint,
          owner: receiverOwner,
          uiTokenAmount: { amount: "2500000", decimals: 6, uiAmount: 2.5, uiAmountString: "2.5" },
        },
      ],
    },
  } as unknown as ParsedTransactionWithMeta;
}

describe("extractTokenChanges", () => {
  it("extracts signed deltas for both sides of a USDC transfer", () => {
    const changes = extractTokenChanges(fixture(), registry);
    expect(changes).toHaveLength(2);

    const sent = changes.find((c) => c.tokenAccount === senderAta.toBase58())!;
    expect(sent.symbol).toBe("USDC");
    expect(sent.rawChange).toBe(-2_500_000n);
    expect(sent.uiChange).toBe("-2.5");
    expect(sent.owner).toBe(senderOwner);
    expect(sent.failed).toBe(false);
    expect(sent.signature).toBe("sig111");

    const received = changes.find((c) => c.tokenAccount === receiverAta.toBase58())!;
    expect(received.rawChange).toBe(2_500_000n);
    expect(received.uiChange).toBe("2.5");
  });

  it("recognises SBTS (Token-2022) mint", () => {
    const changes = extractTokenChanges(fixture({ mint: SBTS_MINT.toBase58() }), registry);
    expect(changes).toHaveLength(2);
    expect(changes[0]!.symbol).toBe("SBTS");
  });

  it("ignores unsupported mints", () => {
    const changes = extractTokenChanges(
      fixture({ mint: Keypair.generate().publicKey.toBase58() }),
      registry
    );
    expect(changes).toHaveLength(0);
  });

  it("flags failed transactions", () => {
    const changes = extractTokenChanges(fixture({ err: { InstructionError: [0, "Custom"] } }), registry);
    expect(changes.every((c) => c.failed)).toBe(true);
  });

  it("handles missing meta gracefully", () => {
    const tx = { ...fixture(), meta: null } as unknown as ParsedTransactionWithMeta;
    expect(extractTokenChanges(tx, registry)).toEqual([]);
  });

  it("handles newly-created ATAs (no pre balance)", () => {
    const f = fixture();
    (f.meta!.preTokenBalances as unknown[]) = [f.meta!.preTokenBalances![0]];
    const changes = extractTokenChanges(f, registry);
    const received = changes.find((c) => c.tokenAccount === receiverAta.toBase58())!;
    expect(received.rawChange).toBe(2_500_000n);
  });
});
