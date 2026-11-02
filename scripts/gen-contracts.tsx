/**
 * Spec-first synthetic contract generator (needs ANTHROPIC_API_KEY).
 *   pnpm gen:contracts evals/specs/<slug>.json
 * Claude writes a 6–10 page subcontract in prose around the spec's expected values; the renderer
 * turns it into a PDF; the spec remains the answer key. Independence rule: this prompt shares no
 * wording or glossary with the extraction prompt, and clause order and phrasing are randomized.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import React from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import { anthropic, MODEL } from "../src/lib/ai/client";
import { ContractDocument, parseContractMarkdown } from "../src/lib/pdf/contract-doc";
import type { ContractSpec } from "../src/domain/rules/from-spec";

const file = process.argv[2];
if (!file) {
  console.error("usage: pnpm gen:contracts evals/specs/<slug>.json");
  process.exit(1);
}
const spec = JSON.parse(readFileSync(file, "utf8")) as ContractSpec & { brief?: string };
const seed = Math.floor(Math.random() * 1e6);

const SYSTEM = `You draft realistic American construction subcontracts for a fictional general contractor. Write in the plain, formal register of a mid-size GC's standard form: numbered articles, defined terms, no legalese flourishes. Everything is fictional: invent company names, license numbers, addresses, specification sections and a project consistent with the brief. Never copy text from any real published form. Output Markdown using exactly this structure: a single "# TITLE" line, preamble paragraphs, then "## ARTICLE N — HEADING" sections, paragraphs numbered N.N, a signature paragraph, and a final "## EXHIBIT — SCHEDULE OF VALUES" section with a pipe table whose last row is the subcontract sum. Target 2,400–3,400 words. Use randomization seed ${seed} to vary article order and phrasing from other drafts.`;

async function main() {
  const client = anthropic();
  const brief = {
    subcontractSum: "choose a round amount between $150,000 and $600,000",
    terms: spec.expected,
    anchors: "For each term, write at least one sentence that states it plainly enough that a careful reader could quote it as evidence. For terms marked null, say nothing about them at all.",
    extra: spec.notes ?? "",
    anomalies: spec.anomalies.map((a) => a.description),
  };
  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 9000,
    system: SYSTEM,
    messages: [{ role: "user", content: `Draft the subcontract described by this brief (JSON):\n${JSON.stringify(brief, null, 2)}` }],
  });
  const text = res.content.filter((b) => b.type === "text").map((b) => b.text).join("\n");
  const mdPath = path.resolve(path.dirname(file), "..", "contracts", spec.file.replace(/\.pdf$/, ".md"));
  writeFileSync(mdPath, text);
  const blocks = parseContractMarkdown(text);
  const buf = await renderToBuffer(<ContractDocument blocks={blocks} runningTitle={spec.slug} />);
  writeFileSync(mdPath.replace(/\.md$/, ".pdf"), buf);
  console.log(`wrote ${mdPath} and PDF (${buf.length} bytes). Now set the spec's anchors to verbatim phrases from it, or let pnpm eval score it on values only.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
