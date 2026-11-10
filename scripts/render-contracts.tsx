/**
 * seed/contracts/*.md and seed/states/contracts/*.md → *.pdf beside them, then extracts per-page text
 * with unpdf and reports pages/words.
 * Usage: pnpm render:contracts
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import React from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import { extractText, getDocumentProxy } from "unpdf";
import { ContractDocument, parseContractMarkdown } from "../src/lib/pdf/contract-doc";

async function main() {
  for (const dir of ["seed/contracts", "seed/states/contracts"].map((d) => path.resolve(d))) await renderDir(dir);
}

async function renderDir(dir: string) {
  const files = readdirSync(dir).filter((f) => f.endsWith(".md"));
  for (const f of files) {
    const src = readFileSync(path.join(dir, f), "utf8");
    const blocks = parseContractMarkdown(src);
    const title = blocks.find((b) => b.type === "title");
    const subNo = (src.match(/(?:Subcontract|Agreement) No\. ([A-Z0-9-]+)/) ?? [])[1] ?? "";
    const runningTitle = `${title?.type === "title" ? title.text : f} · ${subNo}`;
    const buf = await renderToBuffer(<ContractDocument blocks={blocks} runningTitle={runningTitle} />);
    const out = path.join(dir, f.replace(/\.md$/, ".pdf"));
    writeFileSync(out, buf);
    const pdf = await getDocumentProxy(new Uint8Array(buf));
    const { totalPages, text } = await extractText(pdf, { mergePages: false });
    const words = text.join(" ").split(/\s+/).filter(Boolean).length;
    console.log(`${path.basename(out)}: ${totalPages} pages, ${words} words, ${buf.length} bytes`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
