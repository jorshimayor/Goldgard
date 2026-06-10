import { NextResponse } from "next/server";

import {
  defaultTestnetSimulationCases,
  runTestnetSimulationBatch,
} from "../../../lib/server/testnetSimulationRunner.mjs";

export const runtime = "nodejs";

export async function POST(request) {
  const body = await request.json().catch(() => ({}));

  try {
    const result = await runTestnetSimulationBatch({
      workingDir: process.cwd(),
      cases:
        Array.isArray(body?.cases) && body.cases.length > 0
          ? body.cases
          : defaultTestnetSimulationCases,
      persistReport: body?.persistReport !== false,
      reportBasename: body?.reportBasename,
    });

    return NextResponse.json({
      ok: true,
      ...result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message.includes("Missing SEPOLIA_RPC_URL") ? 400 : 500;

    return NextResponse.json(
      {
        ok: false,
        error: message,
        requiredEnv: ["SEPOLIA_RPC_URL", "SEPOLIA_PRIVATE_KEY or PRIVATE_KEY"],
      },
      { status },
    );
  }
}
