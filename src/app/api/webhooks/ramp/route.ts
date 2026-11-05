import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getDb, schema } from "@/db/client";
import { handleRailWebhook } from "@/server/actions/payments";
import { RampRail, verifyRampSignature } from "@/server/rails/ramp";
import { isChallenge } from "@/server/rails/types";

/**
 * POST /api/webhooks/ramp — Ramp delivery endpoint.
 * Ramp retries 429/5xx/timeouts (10 attempts) and gives up on other 4xx, so: bad signature → 401,
 * irrelevant or duplicate → 200, processing failure → 500 to get a retry. Idempotent on event id.
 * The registration challenge is stored so `pnpm ramp:webhook` can complete verification.
 */
export async function POST(req: Request) {
  const raw = await req.text();
  const parsed = await new RampRail().parseWebhook(raw, req.headers);
  if (isChallenge(parsed)) {
    const db = await getDb();
    await db
      .insert(schema.webhookInbox)
      .values({ id: randomUUID(), rail: "ramp", externalEventId: `verification:${parsed.challenge}`, payload: parsed.raw as object, processedAt: new Date() })
      .onConflictDoNothing();
    return NextResponse.json({ ok: true });
  }
  if (!parsed) {
    const valid = verifyRampSignature(raw, req.headers.get("x-ramp-signature"), process.env.RAMP_WEBHOOK_SECRET);
    return valid ? new NextResponse("ignored", { status: 200 }) : new NextResponse("invalid signature", { status: 401 });
  }
  try {
    const result = await handleRailWebhook("ramp", parsed);
    return NextResponse.json(result);
  } catch (e) {
    console.error("ramp webhook failed", e);
    return new NextResponse("processing failed", { status: 500 });
  }
}
