import { NextResponse } from "next/server";
import { createPublicClient, createWalletClient, http, parseEther, parseUnits } from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { getDemoConfigForChain } from "../../../lib/demoConfig";
import { mockErc20Abi } from "../../../lib/abi/mockErc20";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    chainId?: number;
    address?: `0x${string}`;
    tokenAmount?: string;
    ethAmount?: string;
  };

  const chainId = body.chainId ?? 31337;
  if (chainId !== 31337) {
    return NextResponse.json(
      { ok: false, error: "Faucet is only enabled for local demo (chainId 31337)." },
      { status: 400 },
    );
  }

  const to = body.address;
  if (!to || !/^0x[0-9a-fA-F]{40}$/.test(to)) {
    return NextResponse.json({ ok: false, error: "Missing or invalid address." }, { status: 400 });
  }

  const rpcUrl = process.env.DEMO_RPC_URL ?? "http://127.0.0.1:8545";
  const pkRaw = process.env.DEMO_PRIVATE_KEY;
  if (!pkRaw) {
    return NextResponse.json(
      { ok: false, error: "Missing DEMO_PRIVATE_KEY." },
      { status: 400 },
    );
  }

  const pk = pkRaw.startsWith("0x") ? (pkRaw as `0x${string}`) : (`0x${pkRaw}` as `0x${string}`);

  const cfg = getDemoConfigForChain(chainId);
  const token0 = cfg.token0 as `0x${string}`;
  const token1 = cfg.token1 as `0x${string}`;

  const ethAmount = body.ethAmount ?? "1";
  const tokenAmount = body.tokenAmount ?? "10000";

  const account = privateKeyToAccount(pk);
  const transport = http(rpcUrl);

  const publicClient = createPublicClient({ transport });
  const walletClient = createWalletClient({ account, transport });

  try {
    const fundHash = await walletClient.sendTransaction({
      chain: null,
      to,
      value: parseEther(ethAmount),
    });

    const mintAmount = parseUnits(tokenAmount, 18);

    const mint0Hash = await walletClient.writeContract({
      chain: null,
      abi: mockErc20Abi,
      address: token0,
      functionName: "mint",
      args: [to, mintAmount],
    });

    const mint1Hash = await walletClient.writeContract({
      chain: null,
      abi: mockErc20Abi,
      address: token1,
      functionName: "mint",
      args: [to, mintAmount],
    });

    await Promise.all([
      publicClient.waitForTransactionReceipt({ hash: fundHash }),
      publicClient.waitForTransactionReceipt({ hash: mint0Hash }),
      publicClient.waitForTransactionReceipt({ hash: mint1Hash }),
    ]);

    return NextResponse.json({
      ok: true,
      fundHash,
      mint0Hash,
      mint1Hash,
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
