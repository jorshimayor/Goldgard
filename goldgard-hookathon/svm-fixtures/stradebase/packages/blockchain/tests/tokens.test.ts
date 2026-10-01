import { describe, it, expect } from "vitest";
import { Keypair, PublicKey } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import {
  createTokenRegistry,
  tokenByMint,
  allTokens,
  MAINNET_USDC_MINT,
  MAINNET_USDT_MINT,
} from "../src/tokens.js";
import { deriveAta } from "../src/ata.js";
import { buildTransferInstructions } from "../src/transfers.js";

const SBTS_MINT = Keypair.generate().publicKey;

function mainnetRegistry() {
  return createTokenRegistry({ cluster: "mainnet-beta", sbtsMint: SBTS_MINT });
}

describe("createTokenRegistry", () => {
  it("uses canonical mainnet mints and correct programs", () => {
    const r = mainnetRegistry();
    expect(r.USDC.mint.equals(MAINNET_USDC_MINT)).toBe(true);
    expect(r.USDT.mint.equals(MAINNET_USDT_MINT)).toBe(true);
    expect(r.USDC.programId.equals(TOKEN_PROGRAM_ID)).toBe(true);
    expect(r.USDT.programId.equals(TOKEN_PROGRAM_ID)).toBe(true);
    expect(r.SBTS.programId.equals(TOKEN_2022_PROGRAM_ID)).toBe(true);
    expect(r.USDC.decimals).toBe(6);
    expect(r.USDT.decimals).toBe(6);
    expect(r.SBTS.decimals).toBe(9);
    expect(r.SBTS.pegCurrency).toBe("GBP");
  });

  it("requires explicit USDT mint on devnet", () => {
    expect(() =>
      createTokenRegistry({ cluster: "devnet", sbtsMint: SBTS_MINT })
    ).toThrow(/USDT/);
  });

  it("rejects malformed mints", () => {
    expect(() =>
      createTokenRegistry({ cluster: "mainnet-beta", sbtsMint: "not-a-key" })
    ).toThrow(/Invalid public key/);
  });

  it("looks up tokens by mint", () => {
    const r = mainnetRegistry();
    expect(tokenByMint(r, MAINNET_USDC_MINT)?.symbol).toBe("USDC");
    expect(tokenByMint(r, SBTS_MINT.toBase58())?.symbol).toBe("SBTS");
    expect(tokenByMint(r, Keypair.generate().publicKey)).toBeUndefined();
    expect(allTokens(r)).toHaveLength(3);
  });
});

describe("deriveAta", () => {
  it("derives different ATAs for Token vs Token-2022 mints", () => {
    const r = mainnetRegistry();
    const owner = Keypair.generate().publicKey;
    const usdcAta = deriveAta(owner, r.USDC);
    const sbtsAta = deriveAta(owner, r.SBTS);
    expect(usdcAta.equals(sbtsAta)).toBe(false);
    expect(PublicKey.isOnCurve(usdcAta.toBytes())).toBe(false); // ATAs are PDAs
  });
});

describe("buildTransferInstructions", () => {
  const r = mainnetRegistry();
  const from = Keypair.generate().publicKey;
  const to = Keypair.generate().publicKey;

  it("produces ATA-create + transferChecked with the right program", () => {
    for (const token of allTokens(r)) {
      const ixs = buildTransferInstructions({ from, to, token, amount: 1000n });
      expect(ixs).toHaveLength(2);
      // ix[1] is the transfer — must target the token's own program
      expect(ixs[1]!.programId.equals(token.programId)).toBe(true);
      // transferChecked opcode = 12
      expect(ixs[1]!.data[0]).toBe(12);
    }
  });

  it("rejects zero/negative amounts and self-transfers", () => {
    expect(() =>
      buildTransferInstructions({ from, to, token: r.USDC, amount: 0n })
    ).toThrow(/positive/);
    expect(() =>
      buildTransferInstructions({ from, to, token: r.USDC, amount: -5n })
    ).toThrow(/positive/);
    expect(() =>
      buildTransferInstructions({ from, to: from, token: r.USDC, amount: 1n })
    ).toThrow(/same wallet/);
  });
});
