import { NextResponse } from "next/server";
import React from "react";
import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import { auth } from "@/server/auth";
import { getWaiver } from "@/server/scoped";
import { WaiverDocument } from "@/lib/pdf/waiver-doc";
import type { WaiverFields } from "@/domain/waivers/ca";

/** Renders the statutory waiver (signed or blank) as a PDF for anyone allowed to see it. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session) return new NextResponse("Sign in required", { status: 401 });
  const w = await getWaiver(session.org, id);
  if (!w) return new NextResponse("Not found", { status: 404 });
  const signature = w.signedAt && w.signerName && w.signatureHash ? { signerName: w.signerName, signerTitle: w.signerTitle, signedAt: w.signedAt, hash: w.signatureHash } : null;
  const element = React.createElement(WaiverDocument, { fields: w.fields as WaiverFields, signature }) as unknown as React.ReactElement<DocumentProps>;
  const buf = await renderToBuffer(element);
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="waiver-${w.form}-${w.id.slice(0, 8)}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
