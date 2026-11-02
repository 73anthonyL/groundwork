import { NextResponse } from "next/server";
import { auth } from "@/server/auth";
import { getDocument } from "@/server/scoped";

/** Streams a stored PDF to a persona that is allowed to see it. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session) return new NextResponse("Sign in required", { status: 401 });
  const doc = await getDocument(session.org, id);
  if (!doc) return new NextResponse("Not found", { status: 404 });
  const bytes = Buffer.from(doc.bytesB64, "base64");
  return new NextResponse(bytes, {
    headers: {
      "Content-Type": doc.mime,
      "Content-Length": String(bytes.length),
      "Content-Disposition": `inline; filename="${doc.filename}"`,
      "Cache-Control": "private, max-age=300",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
