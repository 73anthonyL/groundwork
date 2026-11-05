/** Attach a GC-uploaded subcontract PDF to a contract so it can be compiled. */
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { sha256Hex } from "@/lib/ids";
import { extractPageTexts } from "@/lib/pdf/text";
import { emit, type Actor } from "@/server/events";

export const MAX_PDF_BYTES = 4 * 1024 * 1024; // Vercel request bodies cap at 4.5 MB

export class UploadError extends Error {}

export async function attachContractDocument(input: { contractId: string; orgId: string; filename: string; bytes: Uint8Array; actor: Actor }) {
  const { bytes } = input;
  if (bytes.length === 0) throw new UploadError("The file is empty.");
  if (bytes.length > MAX_PDF_BYTES) throw new UploadError("PDFs up to 4 MB, please.");
  if (Buffer.from(bytes.subarray(0, 5)).toString("latin1") !== "%PDF-") throw new UploadError("That file is not a PDF.");

  const db = await getDb();
  const contract = await db.query.contracts.findFirst({ where: eq(schema.contracts.id, input.contractId) });
  if (!contract) throw new UploadError("Contract not found.");
  if (contract.status === "active") throw new UploadError("This contract's rules are approved and frozen to the PDF they were compiled from.");

  let pages: string[];
  let pageCount: number;
  try {
    ({ pages, pageCount } = await extractPageTexts(bytes));
  } catch {
    throw new UploadError("Couldn't read that PDF. Is it encrypted or damaged?");
  }
  if (!pages.some((t) => t.trim().length > 0)) throw new UploadError("This PDF has no text layer (it looks scanned). Upload a text PDF.");

  const buf = Buffer.from(bytes);
  const sha256 = sha256Hex(buf);
  const documentId = randomUUID();
  await db.transaction(async (tx) => {
    await tx.insert(schema.documents).values({
      id: documentId,
      orgId: input.orgId,
      kind: "subcontract",
      filename: input.filename.replace(/[^\w.\- ]+/g, "_").slice(0, 120) || "subcontract.pdf",
      mime: "application/pdf",
      sha256,
      bytesB64: buf.toString("base64"),
      byteLength: buf.length,
      pageCount,
      pageTexts: pages,
    });
    await tx.update(schema.contracts).set({ documentId }).where(eq(schema.contracts.id, input.contractId));
    await emit(tx, {
      aggregateType: "contract",
      aggregateId: input.contractId,
      type: "document.attached",
      actor: input.actor,
      payload: { documentId, sha256, pageCount, replaced: contract.documentId },
      correlationId: input.contractId,
    });
  });
  return { documentId, pageCount };
}
