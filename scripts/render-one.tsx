/**
 * Dev tool: render one contract markdown file to a PDF anywhere on disk.
 * Usage: node --import tsx scripts/render-one.tsx <in.md> <out.pdf>
 */
import { readFileSync, writeFileSync } from "node:fs";
import React from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import { extractText, getDocumentProxy } from "unpdf";
import { ContractDocument, parseContractMarkdown } from "../src/lib/pdf/contract-doc";

const [input, output] = process.argv.slice(2);
const src = readFileSync(input, "utf8");
const blocks = parseContractMarkdown(src);
const title = blocks.find((b) => b.type === "title");
const subNo = (src.match(/(?:Subcontract|Agreement) No\. ([A-Z0-9-]+)/) ?? [])[1] ?? "";
const buf = await renderToBuffer(<ContractDocument blocks={blocks} runningTitle={`${title?.type === "title" ? title.text : "Subcontract"} · ${subNo}`} />);
writeFileSync(output, buf);
const { totalPages, text } = await extractText(await getDocumentProxy(new Uint8Array(buf)), { mergePages: false });
console.log(`${output}: ${totalPages} pages, ${text.join(" ").split(/\s+/).filter(Boolean).length} words, ${buf.length} bytes`);
