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
  if (chainId !== 11155111 && chainId !== 31337) {
    return NextResponse.json(
      { ok: false, error: "Unsupported chainId.", chainId },
      { status: 400 },
    );
  }

  const rpcUrl = chainId === 11155111 ? process.env.SEPOLIA_RPC_URL : process.env.LOCAL_RPC_URL;
  const privateKey =
    chainId === 11155111
      ? process.env.SEPOLIA_PRIVATE_KEY ?? process.env.PRIVATE_KEY
      : process.env.LOCAL_PRIVATE_KEY ??
        process.env.PRIVATE_KEY ??
        "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
  const demoConfig =
    chainId === 11155111
      ? "../frontend/app/config/demoConfig.sepolia.json"
      : "../frontend/app/config/demoConfig.local.json";

  if (!rpcUrl || !privateKey) {
    return NextResponse.json(
      {
        ok: false,
        error:
          chainId === 11155111
            ? "Missing SEPOLIA_RPC_URL/SEPOLIA_PRIVATE_KEY."
            : "Missing LOCAL_RPC_URL/LOCAL_PRIVATE_KEY.",
      },
      { status: 400 },
    );
  }

  const root = process.cwd();
  const contractsDir = `${root}/../contracts`;
  const forge = process.env.FORGE_BIN ?? "forge";

  const moveBps = body.moveBps ?? 1000;
  const steps = body.steps ?? 5;
  const directionUp = body.directionUp ?? true;

  const env = {
    ...process.env,
    PRIVATE_KEY: privateKey,
    DEMO_CONFIG: demoConfig,
    MOVE_BPS: String(moveBps),
    STEPS: String(steps),
    DIRECTION_UP: directionUp ? "true" : "false",
  };

  try {
    const { stdout, stderr } = await execFileAsync(
      forge,
      [
        "script",
        "script/SimulatePriceSwing.s.sol:SimulatePriceSwing",
        "--rpc-url",
        rpcUrl,
        "--broadcast",
      ],
      { cwd: contractsDir, env },
    );

    return NextResponse.json({ ok: true, stdout, stderr });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message },
      { status: 500 },
    );
  }
}
