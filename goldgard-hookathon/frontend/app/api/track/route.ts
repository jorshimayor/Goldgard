import { NextRequest, NextResponse } from "next/server";
import { track } from "@/lib/onchain.server";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {

    const { event, walletAddress, payload } = await req.json();
  try {
    return NextResponse.json(await track(event, walletAddress, payload));
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
