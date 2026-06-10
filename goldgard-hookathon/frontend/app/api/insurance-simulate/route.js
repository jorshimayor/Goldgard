import { NextResponse } from "next/server";

import {
  defaultSimulationConfig,
  formatSimulationReport,
  runInsuranceSimulation,
} from "../../../../scripts/insuranceSimulation.mjs";

export const runtime = "nodejs";

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const config = body?.config ?? {};

  try {
    const report = runInsuranceSimulation(config);
    const markdown = formatSimulationReport(report);
    return NextResponse.json({
      ok: true,
      configUsed: body?.config ?? defaultSimulationConfig,
      report,
      markdown,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 400 },
    );
  }
}
