/**
 * Spec-first synthetic contract generator (needs ANTHROPIC_API_KEY).
 *   pnpm gen:contracts evals/specs/*.json [--force]
 * For each spec, Claude drafts a subcontract around the spec's expected values and drafting brief;
 * the renderer turns it into a PDF; the spec remains the answer key.
 *
 * Independence: the drafting prompt shares no wording or glossary with the extraction prompt, and
 * clause order and phrasing are randomized.
 * Audit: a second, separate call checks the draft against the brief (did the twist land where it was
 * asked to, does every expected term appear, and nothing the spec marks absent). A draft that fails is
 * redrafted once; if it fails again the audit is saved as failed and `pnpm eval` skips that contract,
 * so a bad draft can never be scored as an extraction error.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import React from "react";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { renderToBuffer } from "@react-pdf/renderer";
import { anthropic, MODEL } from "../src/lib/ai/client";
import { ContractDocument, parseContractMarkdown } from "../src/lib/pdf/contract-doc";
import type { ContractSpec } from "../src/domain/rules/from-spec";

type GenSpec = ContractSpec & { brief?: string; executedOn?: string };

const files = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const force = process.argv.includes("--force");
if (!files.length) {
  console.error("usage: pnpm gen:contracts evals/specs/<slug>.json [...] [--force]");
  process.exit(1);
}

const system = (seed: number) =>
  `You draft realistic American construction subcontracts for a fictional general contractor. Write in the plain, formal register of a mid-size GC's standard form: numbered articles, defined terms, no legalese flourishes. Everything is fictional: invent license numbers, addresses and specification sections consistent with the brief. Never copy text from any real published form. Output Markdown using exactly this structure: a single "# TITLE" line, preamble paragraphs, then "## ARTICLE N — HEADING" sections, paragraphs numbered N.N, a signature paragraph, then any riders, amendments or exhibits the brief asks for as "## ..." sections, and a final "## EXHIBIT — SCHEDULE OF VALUES" section with a pipe table whose last row is the subcontract sum. Target 2,400–3,400 words unless the brief says otherwise. Use randomization seed ${seed} to vary article order and phrasing from other drafts.`;

const Audit = z.object({
  brief_followed: z.boolean(),
  decisive_passage: z.string(),
  problems: z.array(z.string()),
});

const AUDIT_SYSTEM = `You check a drafted contract against the drafting brief it was written from. You are strict: the draft fails if the special instruction was not carried out where and how it says, if any listed term is missing or stated with a different value, or if the draft states a term the brief lists as absent (null). Quote the passage that carries out the special instruction, verbatim. List every problem; an empty list means it passed.`;

async function draft(spec: GenSpec): Promise<string> {
  const seed = Math.floor(Math.random() * 1e6);
  const brief = {
    contract_date: spec.executedOn ?? "2026-02-02",
    subcontractSum: "choose a round amount between $150,000 and $600,000",
    terms: spec.expected,
    special_instruction: spec.brief ?? "none",
    anchors: "For each term, write at least one sentence that states it plainly enough that a careful reader could quote it as evidence, except where the special instruction says otherwise. For terms that are null, say nothing about them at all.",
    notes: spec.notes ?? "",
    must_be_noticeable: spec.anomalies.map((a) => a.description),
  };
  const res = await anthropic().messages.create({
    model: MODEL,
    max_tokens: 16_000,
    system: system(seed),
    messages: [{ role: "user", content: `Draft the subcontract described by this brief (JSON):\n${JSON.stringify(brief, null, 2)}` }],
  });
  return res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("\n");
}

async function audit(spec: GenSpec, text: string) {
  const res = await anthropic().messages.parse({
    model: MODEL,
    max_tokens: 4_000,
    system: AUDIT_SYSTEM,
    output_config: { format: zodOutputFormat(Audit) },
    messages: [
      {
        role: "user",
        content: `BRIEF\nspecial instruction: ${spec.brief ?? "none"}\nterms (null = must be absent): ${JSON.stringify(spec.expected)}\n\nDRAFT\n${text}`,
      },
    ],
  });
  const a = res.parsed_output;
  if (!a) throw new Error(`audit returned no output (${res.stop_reason})`);
  return { ...a, passed: a.brief_followed && a.problems.length === 0 };
}

async function one(file: string) {
  const spec = JSON.parse(readFileSync(file, "utf8")) as GenSpec;
  const outDir = path.resolve(path.dirname(file), "..", "contracts");
  mkdirSync(outDir, { recursive: true });
  const mdPath = path.join(outDir, spec.file.replace(/\.pdf$/, ".md"));
  const pdfPath = path.join(outDir, spec.file);
  const auditPath = path.join(outDir, spec.file.replace(/\.pdf$/, ".audit.json"));
  if (!force && existsSync(pdfPath)) return console.log(`skip ${spec.slug} (exists)`);
  let text = "";
  let result: Awaited<ReturnType<typeof audit>> | null = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    text = await draft(spec);
    result = await audit(spec, text);
    if (result.passed) break;
    console.warn(`${spec.slug}: draft ${attempt} failed audit: ${result.problems.join("; ")}`);
  }
  writeFileSync(mdPath, text);
  writeFileSync(auditPath, JSON.stringify({ ...result, model: MODEL, at: new Date().toISOString() }, null, 2));
  const buf = await renderToBuffer(<ContractDocument blocks={parseContractMarkdown(text)} runningTitle={spec.slug} />);
  writeFileSync(pdfPath, buf);
  console.log(`${result?.passed ? "ok  " : "FAIL"} ${spec.slug} (${buf.length} bytes)`);
}

async function main() {
  const queue = [...files];
  await Promise.all(
    Array.from({ length: Math.min(3, queue.length) }, async () => {
      for (let f = queue.shift(); f; f = queue.shift()) {
        try {
          await one(f);
        } catch (e) {
          console.error(`error ${f}: ${(e as Error).message}`);
        }
      }
    }),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
