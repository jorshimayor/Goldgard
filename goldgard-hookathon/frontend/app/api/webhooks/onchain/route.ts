// app/api/webhooks/onchain/route.ts
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

export const runtime = "nodejs"; // need Node crypto + raw body (NOT the edge runtime)
export const dynamic = "force-dynamic"; // never cache a webhook

const SECRET = process.env.ONCHAIN_WEBHOOK_SECRET!;

function verify(header: string | null, raw: string): boolean {
  if (!header) return false;

  const parts = Object.fromEntries(
    header.split(",").map((kv) => kv.split("=")),
  ); // t=…,v1=…

  if (!parts.t || !parts.v1) return false;

  const expected = crypto
    .createHmac("sha256", SECRET)
    .update(`${parts.t}.${raw}`)
    .digest("hex"); // sign "<t>.<rawBody>"

  const a = Buffer.from(expected),
    b = Buffer.from(parts.v1);

  return a.length === b.length && crypto.timingSafeEqual(a, b); // constant-time compare
}

export async function POST(req: NextRequest) {
  const raw = await req.text(); // RAW body — verify against THIS string

  if (!verify(req.headers.get("x-onchain-signature"), raw))
    return new NextResponse("bad signature", { status: 401 });

  const evt = JSON.parse(raw); // { id, type, createdAt, data }

  // idempotency (optional but recommended): skip if you've seen this delivery id before
  // const deliveryId = req.headers.get("x-onchain-delivery");
  switch (evt.type) {
    case "contact.created":
      /* upsert the user, kick a welcome flow … */ break;

    case "contact.unsubscribed":
      /* flip a suppression flag … */ break;

    case "message.delivered":

    case "message.viewed":

    case "message.clicked":
      /* record analytics … */ break;

    case "automation.completed":
      /* fulfilment / downstream job … */ break;

    default:
      /* ignore unknown types — new ones can appear later */ break;
  }
  return NextResponse.json({ received: true }); // 2xx FAST; do slow work afterward
}
