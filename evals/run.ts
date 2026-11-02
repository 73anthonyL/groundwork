/**
 * Extraction eval. For every spec in seed/specs and evals/specs, the PDF is compiled (by the model
 * when ANTHROPIC_API_KEY is set, otherwise from cached results) and scored against the spec's expected
 * values: value accuracy, quote-verified rate, and calibration (share of wrong fields marked low/medium).
 *
 *   pnpm eval               use cache if present, else call the model
 *   pnpm eval --fresh       always call the model
 *   pnpm eval --cache-only  never call the model (CI)
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { extractPageTexts } from "../src/lib/pdf/text";
import { ExtractedRuleSetSchema, RULE_FIELDS, getField, toValues, type ExtractedRuleSet, type RuleFieldPath } from "../src/domain/rules/schema";
import { verifyQuote } from "../src/lib/verify/quote";
import type { ContractSpec } from "../src/domain/rules/from-spec";

const fresh = process.argv.includes("--fresh");
const cacheOnly = process.argv.includes("--cache-only");
const cacheDir = path.resolve("evals/cache");
mkdirSync(cacheDir, { recursive: true });

function loadSpecs(): { spec: ContractSpec; dir: string }[] {
  const out: { spec: ContractSpec; dir: string }[] = [];
  for (const dir of ["seed", "evals"]) {
    const specDir = path.resolve(dir, "specs");
    if (!existsSync(specDir)) continue;
    for (const f of readdirSync(specDir).filter((x) => x.endsWith(".json"))) {
      out.push({ spec: JSON.parse(readFileSync(path.join(specDir, f), "utf8")) as ContractSpec, dir });
    }
  }
  return out;
}

function same(path: RuleFieldPath, a: unknown, b: unknown): boolean {
  if (a === null || b === null) return a === b;
  if (typeof a === "string" && typeof b === "string") {
    const n = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    // Free-text fields: accept when one contains the other's key words (≥ 70% token overlap).
    if (["retainage.release_condition", "retainage.reduction_trigger", "parties.project"].includes(path)) {
      const ta = new Set(n(a).split(" "));
      const tb = n(b).split(" ");
      const hit = tb.filter((t) => ta.has(t)).length;
      return hit / Math.max(1, tb.length) >= 0.7;
    }
    return n(a) === n(b);
  }
  return a === b;
}

async function compile(spec: ContractSpec, pdfPath: string): Promise<{ extracted: ExtractedRuleSet; model: string; ms: number; cached: boolean }> {
  const cacheFile = path.join(cacheDir, `${spec.slug}.json`);
  if (!fresh && existsSync(cacheFile)) {
    const c = JSON.parse(readFileSync(cacheFile, "utf8")) as { extracted: ExtractedRuleSet; model: string; ms: number };
    return { ...c, cached: true };
  }
  if (cacheOnly) throw new Error(`no cached extraction for ${spec.slug}`);
  const { extractRuleSet } = await import("../src/lib/ai/extractRuleSet");
  const r = await extractRuleSet(new Uint8Array(readFileSync(pdfPath)));
  const record = { extracted: r.extracted, model: r.model, ms: r.ms, promptVersion: r.promptVersion, usage: r.usage, at: new Date().toISOString() };
  writeFileSync(cacheFile, JSON.stringify(record, null, 2));
  return { ...record, cached: false };
}

async function main() {
  const specs = loadSpecs();
  const rows: { slug: string; fields: number; correct: number; verified: number; quoted: number; wrongLowMed: number; wrong: number; model: string; ms: number; cached: boolean; misses: string[] }[] = [];
  for (const { spec, dir } of specs) {
    const pdfPath = path.resolve(dir, "contracts", spec.file);
    if (!existsSync(pdfPath)) {
      console.warn(`skip ${spec.slug}: ${pdfPath} missing (run pnpm render:contracts)`);
      continue;
    }
    const { pages } = await extractPageTexts(new Uint8Array(readFileSync(pdfPath)));
    let result: Awaited<ReturnType<typeof compile>>;
    try {
      result = await compile(spec, pdfPath);
    } catch (e) {
      console.warn(`skip ${spec.slug}: ${(e as Error).message}`);
      continue;
    }
    ExtractedRuleSetSchema.parse(result.extracted);
    const got = toValues(result.extracted);
    let correct = 0;
    let verified = 0;
    let quoted = 0;
    let wrong = 0;
    let wrongLowMed = 0;
    const misses: string[] = [];
    for (const p of RULE_FIELDS) {
      const exp = p.split(".").reduce<unknown>((o, k) => (o as Record<string, unknown>)[k], spec.expected);
      const act = p.split(".").reduce<unknown>((o, k) => (o as Record<string, unknown>)[k], got);
      const f = getField(result.extracted, p);
      const ok = same(p, act, exp);
      if (ok) correct++;
      else {
        wrong++;
        if (f.evidence && f.evidence.confidence !== "high") wrongLowMed++;
        misses.push(`${p}: expected ${JSON.stringify(exp)} got ${JSON.stringify(act)}`);
      }
      if (f.evidence) {
        quoted++;
        const v = verifyQuote(pages, f.evidence.quote, f.evidence.page);
        if (v.status === "exact" || (v.status === "fuzzy" && (v.score ?? 0) >= 0.95)) verified++;
      }
    }
    rows.push({ slug: spec.slug, fields: RULE_FIELDS.length, correct, verified, quoted, wrong, wrongLowMed, model: result.model, ms: result.ms, cached: result.cached, misses });
  }
  const totals = rows.reduce(
    (t, r) => ({ fields: t.fields + r.fields, correct: t.correct + r.correct, verified: t.verified + r.verified, quoted: t.quoted + r.quoted, wrong: t.wrong + r.wrong, wrongLowMed: t.wrongLowMed + r.wrongLowMed }),
    { fields: 0, correct: 0, verified: 0, quoted: 0, wrong: 0, wrongLowMed: 0 },
  );
  const pct = (a: number, b: number) => (b ? `${((100 * a) / b).toFixed(1)}%` : "—");
  const lines = [
    "| Contract | Value accuracy | Quotes verified | Calibration (wrong→low/med) | Model | Time |",
    "|---|---|---|---|---|---|",
    ...rows.map((r) => `| ${r.slug} | ${r.correct}/${r.fields} (${pct(r.correct, r.fields)}) | ${r.verified}/${r.quoted} (${pct(r.verified, r.quoted)}) | ${r.wrong ? pct(r.wrongLowMed, r.wrong) : "n/a"} | ${r.model}${r.cached ? " (cached)" : ""} | ${(r.ms / 1000).toFixed(1)}s |`),
    `| **All** | **${totals.correct}/${totals.fields} (${pct(totals.correct, totals.fields)})** | **${totals.verified}/${totals.quoted} (${pct(totals.verified, totals.quoted)})** | **${totals.wrong ? pct(totals.wrongLowMed, totals.wrong) : "n/a"}** | | |`,
  ];
  const md = lines.join("\n");
  console.log(md);
  for (const r of rows) for (const m of r.misses) console.log(`  miss ${r.slug} ${m}`);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  mkdirSync(path.resolve("evals/results"), { recursive: true });
  writeFileSync(path.resolve("evals/results", `${stamp}.json`), JSON.stringify({ at: stamp, rows, totals }, null, 2));
  writeFileSync(path.resolve("evals/results", "latest.md"), md + "\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
