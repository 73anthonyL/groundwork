/**
 * Extraction eval. Every spec in seed/specs, evals/specs and evals/real/specs is an answer key for a
 * contract PDF in the sibling contracts/ folder. Each PDF is compiled (by the model when
 * ANTHROPIC_API_KEY is set, otherwise from evals/cache) and scored by evals/score.ts.
 *
 *   pnpm eval                 use cache if present, else call the model
 *   pnpm eval --fresh         always call the model
 *   pnpm eval --cache-only    never call the model (CI)
 *   pnpm eval --only=<substr> restrict to matching slugs
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { extractPageTexts } from "../src/lib/pdf/text";
import { ExtractedRuleSetSchema, type ExtractedRuleSet } from "../src/domain/rules/schema";
import { bootstrap, LAYER_LABEL, LAYERS, metrics, scoreContract, type ContractResult, type EvalSpec, type Metrics } from "./score";

const fresh = process.argv.includes("--fresh");
const cacheOnly = process.argv.includes("--cache-only");
const only = process.argv.find((a) => a.startsWith("--only="))?.slice(7);
const CONCURRENCY = 4;
const cacheDir = path.resolve(process.env.EVAL_CACHE_DIR ?? "evals/cache");
mkdirSync(cacheDir, { recursive: true });

const SPEC_DIRS = ["seed", "evals", "evals/real"];

function loadSpecs(): { spec: EvalSpec; pdf: string }[] {
  const out: { spec: EvalSpec; pdf: string }[] = [];
  for (const dir of SPEC_DIRS) {
    const specDir = path.resolve(dir, "specs");
    if (!existsSync(specDir)) continue;
    for (const f of readdirSync(specDir).filter((x) => x.endsWith(".json"))) {
      const spec = JSON.parse(readFileSync(path.join(specDir, f), "utf8")) as EvalSpec;
      spec.category ??= dir === "seed" ? "demo" : "synthetic";
      if (only && !spec.slug.includes(only)) continue;
      out.push({ spec, pdf: path.resolve(dir, "contracts", spec.file) });
    }
  }
  return out;
}

type Compiled = { extracted: ExtractedRuleSet; model: string; ms: number; cached: boolean; usage?: { input_tokens: number; output_tokens: number } };

async function compile(spec: EvalSpec, pdfPath: string): Promise<Compiled> {
  const cacheFile = path.join(cacheDir, `${spec.slug}.json`);
  if (!fresh && existsSync(cacheFile)) return { ...(JSON.parse(readFileSync(cacheFile, "utf8")) as Compiled), cached: true };
  if (cacheOnly) throw new Error("no cached extraction");
  const { extractRuleSet } = await import("../src/lib/ai/extractRuleSet");
  const r = await extractRuleSet(new Uint8Array(readFileSync(pdfPath)));
  const record = { extracted: r.extracted, model: r.model, ms: r.ms, promptVersion: r.promptVersion, usage: r.usage, at: new Date().toISOString() };
  writeFileSync(cacheFile, JSON.stringify(record, null, 2));
  return { ...record, cached: false } as Compiled;
}

async function pool<T, R>(items: T[], n: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

const pct = (x: number | null) => (x === null ? "n/a" : `${(100 * x).toFixed(1)}%`);
const ci = (c: [number, number] | null) => (c ? ` [${(100 * c[0]).toFixed(0)}–${(100 * c[1]).toFixed(0)}]` : "");

function report(results: ContractResult[], meta: Map<string, Compiled>): string {
  const m = metrics(results);
  const lines: string[] = [];
  lines.push(`# Extraction eval`, "", `${m.contracts} contracts · ${m.fields} fields · ${new Set(results.map((r) => r.category)).size} categories. 95% bootstrap CIs over contracts in brackets.`, "");
  lines.push("## Headline", "", "| Metric | Value |", "|---|---|");
  lines.push(`| Value accuracy | ${pct(m.accuracy)}${ci(bootstrap(results, (x) => x.accuracy))} |`);
  lines.push(`| Quotes verified verbatim | ${pct(m.quoteVerifiedRate)}${ci(bootstrap(results, (x) => x.quoteVerifiedRate))} |`);
  lines.push(`| Wrong fields the model itself hedged (calibration) | ${pct(m.calibration)} |`);
  lines.push(`| Wrong fields reaching the engine unflagged (production policy) | ${m.layers.L3.silentErrors} of ${m.fields} (${pct(m.layers.L3.silentRate)}) |`, "");
  lines.push("## Ablation: what each review layer buys", "", "Same extractions, re-reviewed under four policies. *Caught* = share of wrong values a human is asked to look at. *Burden* = share of all fields a human must look at.", "");
  lines.push("| Policy | Silent errors | Caught | Burden |", "|---|---|---|---|");
  for (const l of LAYERS) {
    const x = m.layers[l];
    lines.push(`| ${l} ${LAYER_LABEL[l]} | ${x.silentErrors} (${pct(x.silentRate)}) | ${pct(x.catchRate)}${ci(bootstrap(results, (y: Metrics) => y.layers[l].catchRate))} | ${pct(x.burden)} |`);
  }
  lines.push("", "## By category", "", "| Category | Contracts | Accuracy | Quotes verified | Silent (prod) | Burden (prod) |", "|---|---|---|---|---|---|");
  for (const cat of [...new Set(results.map((r) => r.category))].sort()) {
    const c = metrics(results.filter((r) => r.category === cat));
    lines.push(`| ${cat} | ${c.contracts} | ${pct(c.accuracy)} | ${pct(c.quoteVerifiedRate)} | ${c.layers.L3.silentErrors} | ${pct(c.layers.L3.burden)} |`);
  }
  lines.push("", "## Per contract", "", "| Contract | Category | Accuracy | Silent (prod) | Model | Time |", "|---|---|---|---|---|---|");
  for (const r of results) {
    const c = metrics([r]);
    const k = meta.get(r.slug)!;
    lines.push(`| ${r.slug} | ${r.category} | ${r.fields.filter((f) => f.correct).length}/${r.fields.length} | ${c.layers.L3.silentErrors} | ${k.model}${k.cached ? " (cached)" : ""} | ${(k.ms / 1000).toFixed(1)}s |`);
  }
  const misses = results.flatMap((r) => r.fields.filter((f) => !f.correct).map((f) => `| ${r.slug} | \`${f.path}\` | ${JSON.stringify(f.expected)} | ${JSON.stringify(f.actual)} | ${f.confidence ?? "—"} | ${f.flagged.L3 ? "flagged" : "**silent**"} |`));
  if (misses.length) lines.push("", "## Every miss", "", "| Contract | Field | Expected | Got | Model confidence | Production policy |", "|---|---|---|---|---|---|", ...misses);
  lines.push("", "Synthetic contracts are generated from their spec, so the spec is the answer key; they measure extraction fidelity, not real-world distribution. Real forms are hand-labeled (see evals/real/README.md).");
  return lines.join("\n");
}

async function main() {
  const specs = loadSpecs();
  const meta = new Map<string, Compiled>();
  const scored = await pool(specs, CONCURRENCY, async ({ spec, pdf }) => {
    if (!existsSync(pdf)) {
      console.warn(`skip ${spec.slug}: ${path.relative(process.cwd(), pdf)} missing`);
      return null;
    }
    const auditFile = pdf.replace(/\.pdf$/, ".audit.json");
    if (existsSync(auditFile) && !(JSON.parse(readFileSync(auditFile, "utf8")) as { passed: boolean }).passed) {
      console.warn(`skip ${spec.slug}: the generated draft failed its audit against the brief, so its answer key is not trustworthy`);
      return null;
    }
    const { pages } = await extractPageTexts(new Uint8Array(readFileSync(pdf)));
    try {
      const c = await compile(spec, pdf);
      ExtractedRuleSetSchema.parse(c.extracted);
      meta.set(spec.slug, c);
      return scoreContract(spec, c.extracted, pages);
    } catch (e) {
      console.warn(`skip ${spec.slug}: ${(e as Error).message}`);
      return null;
    }
  });
  const results = scored.filter((r): r is ContractResult => r !== null);
  if (!results.length) {
    console.error("No contracts scored. Set ANTHROPIC_API_KEY or populate evals/cache.");
    process.exit(1);
  }
  const md = report(results, meta);
  console.log(md);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  mkdirSync(path.resolve("evals/results"), { recursive: true });
  writeFileSync(path.resolve("evals/results", `${stamp}.json`), JSON.stringify({ at: stamp, metrics: metrics(results), results }, null, 2));
  writeFileSync(path.resolve("evals/results", "latest.md"), md + "\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
