import { NextResponse } from "next/server";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

export const runtime = "nodejs";

const execFileAsync = promisify(execFile);

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    chainId?: number;
    directionUp?: boolean;
    moveBps?: number;
    steps?: number;
    amountPerStep?: string;
  };

  const chainId = body.chainId ?? 11155111;
  if (chainId !== 11155111) {
    return NextResponse.json(
      { ok: false, error: "Sepolia-only mode: unsupported chainId.", chainId },
      { status: 400 },
    );
  }

  const rpcUrl = process.env.SEPOLIA_RPC_URL;
  const privateKey = process.env.SEPOLIA_PRIVATE_KEY;

  if (!rpcUrl || !privateKey) {
    return NextResponse.json(
      {
        ok: false,
        error: "Missing SEPOLIA_RPC_URL/SEPOLIA_PRIVATE_KEY. This endpoint is meant for demos run from your machine.",
      },
      { status: 400 },
    );
  }

  const root = process.cwd();
  const forge = process.env.FORGE_BIN ?? "forge";

  const moveBps = body.moveBps ?? 1000;
  const steps = body.steps ?? 5;
  const directionUp = body.directionUp ?? true;

  const env = {
    ...process.env,
    PRIVATE_KEY: privateKey,
    MOVE_BPS: String(moveBps),
    STEPS: String(steps),
    DIRECTION_UP: directionUp ? "true" : "false",
  };

  try {
    const { stdout, stderr } = await execFileAsync(
      forge,
      [
        "script",
        "../contracts/script/SimulatePriceSwing.s.sol:SimulatePriceSwing",
        "--rpc-url",
        rpcUrl,
        "--broadcast",
      ],
      { cwd: `${root}`, env },
    );

    return NextResponse.json({ ok: true, stdout, stderr });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message },
      { status: 500 },
    );
  }
}
