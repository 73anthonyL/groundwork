/** Attach a GC-uploaded subcontract PDF to a contract so it can be compiled. */
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { sha256Hex } from "@/lib/ids";
import { extractPageTexts } from "@/lib/pdf/text";
import { emit, type Actor } from "@/server/events";

export const MAX_PDF_BYTES = 4 * 1024 * 1024; // Vercel request bodies cap at 4.5 MB

export class UploadError extends Error {}

/** Checks that the bytes are a readable text PDF and returns its pages. Throws UploadError otherwise. */
export async function inspectPdf(bytes: Uint8Array) {
  if (bytes.length === 0) throw new UploadError("Choose the subcontract PDF.");
  if (bytes.length > MAX_PDF_BYTES) throw new UploadError("That PDF is larger than 4 MB. Upload a smaller file.");
  if (Buffer.from(bytes.subarray(0, 5)).toString("latin1") !== "%PDF-") throw new UploadError("That file is not a PDF. Choose the subcontract as a PDF.");
  let pages: string[];
  let pageCount: number;
  try {
    // The PDF reader takes ownership of the buffer it is given, so it gets a copy.
    ({ pages, pageCount } = await extractPageTexts(bytes.slice()));
  } catch {
    throw new UploadError("That PDF could not be opened. It may be password-protected or damaged. Try exporting it again.");
  }
  if (!pages.some((t) => t.trim().length > 0)) throw new UploadError("This PDF has no selectable text, so it looks like a scan. Scanned PDFs cannot be read yet. Upload a PDF with selectable text.");
  return { pages, pageCount };
}

export async function attachContractDocument(input: { contractId: string; orgId: string; filename: string; bytes: Uint8Array; actor: Actor }) {
  const { bytes } = input;
  const db = await getDb();
  const contract = await db.query.contracts.findFirst({ where: eq(schema.contracts.id, input.contractId) });
  if (!contract) throw new UploadError("That subcontract could not be found.");
  if (contract.status === "active") throw new UploadError("This subcontract's payment rules are approved and frozen to the PDF they were read from, so the PDF cannot be replaced.");

  const { pages, pageCount } = await inspectPdf(bytes);

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
