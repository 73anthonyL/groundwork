import { extractText, getDocumentProxy } from "unpdf";

/** Per-page text (index 0 = page 1). Scanned pages come back as empty strings. */
export async function extractPageTexts(bytes: Uint8Array): Promise<{ pageCount: number; pages: string[] }> {
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const { totalPages, text } = await extractText(pdf, { mergePages: false });
  return { pageCount: totalPages, pages: text.map((t) => t ?? "") };
}
