import { NextResponse } from "next/server";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

export const runtime = "nodejs";

const execFileAsync = promisify(execFile);

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    directionUp?: boolean;
    moveBps?: number;
    steps?: number;
    amountPerStep?: string;
  };

  const rpcUrl = process.env.DEMO_RPC_URL;
  const privateKey = process.env.DEMO_PRIVATE_KEY;

  if (!rpcUrl || !privateKey) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Missing DEMO_RPC_URL or DEMO_PRIVATE_KEY. This endpoint is meant for local demos (Anvil/Sepolia) run from your machine.",
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
