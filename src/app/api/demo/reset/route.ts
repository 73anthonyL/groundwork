import { NextResponse } from "next/server";
import { CHECKPOINTS, resetTo, type Checkpoint } from "@/server/demo/reset";

/**
 * POST /api/demo/reset?to=fresh  (header: x-demo-token when DEMO_RESET_TOKEN is set)
 * In development no token is required.
 */
export async function POST(req: Request) {
  const token = process.env.DEMO_RESET_TOKEN;
  if (token && req.headers.get("x-demo-token") !== token) {
    return new NextResponse("Forbidden", { status: 403 });
  }
  const to = new URL(req.url).searchParams.get("to") ?? "fresh";
  if (!CHECKPOINTS.includes(to as Checkpoint)) {
    return NextResponse.json({ error: `unknown checkpoint; use one of ${CHECKPOINTS.join(", ")}` }, { status: 400 });
  }
  const result = await resetTo(to as Checkpoint);
  return NextResponse.json(result);
}
