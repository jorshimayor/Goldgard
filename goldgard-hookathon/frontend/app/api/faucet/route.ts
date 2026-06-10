import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST() {
  return NextResponse.json(
    { ok: false, error: "Sepolia-only mode: faucet endpoint is disabled." },
    { status: 400 },
  );
}
