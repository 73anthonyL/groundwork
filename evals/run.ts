/**
 * Extraction eval. Every spec in seed/specs, evals/specs and evals/real/specs is an answer key for a
 * contract PDF in the sibling contracts/ folder. Each PDF is compiled (by the model when
 * ANTHROPIC_API_KEY is set, otherwise from evals/cache) and scored by evals/score.ts.
 *
 *   pnpm eval                 use cache if present, else call the model
 *   pnpm eval --fresh         always call the model
 *   pnpm eval --cache-only    never call the model (CI)
 *   pnpm eval --only=<substr> restrict to matching slugs
 *   pnpm eval --cache-only --check   re-score from the cache and fail unless it reproduces results/latest.json
 *
 * evals/results/latest.{json,md} are the committed record of a run. They are rewritten only by a
 * complete run (every contract scored, no --only) whose scores differ from the record, so re-scoring
 * from the cache leaves the tree clean and a partial run cannot replace the record. See evals/README.md.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { extractPageTexts } from "../src/lib/pdf/text";
import { ExtractedRuleSetSchema } from "../src/domain/rules/schema";
import { MODEL } from "../src/lib/ai/client";
import { PROMPT_VERSION } from "../src/lib/ai/extractRuleSet";
import { readCache, textSha256, writeCache, type CacheRecord } from "./cache";
import { loadSpecs } from "./dataset";
import { compareToRecord, parseRun, planWrite, type Provenance, type RunFile } from "./run-file";
import { bootstrap, LAYER_LABEL, LAYERS, metrics, scoreContract, type ContractResult, type EvalSpec, type Metrics } from "./score";

const fresh = process.argv.includes("--fresh");
const cacheOnly = process.argv.includes("--cache-only");
const check = process.argv.includes("--check");
const only = process.argv.find((a) => a.startsWith("--only="))?.slice(7);
if (check && !cacheOnly) {
  console.error("--check re-scores the committed cache; run it with --cache-only.");
  process.exit(1);
}
if (fresh && cacheOnly) {
  console.error("--fresh and --cache-only contradict each other.");
  process.exit(1);
}
const CONCURRENCY = 4;
const cacheDir = path.resolve(process.env.EVAL_CACHE_DIR ?? "evals/cache");
mkdirSync(cacheDir, { recursive: true });

const LATEST = path.resolve("evals/results/latest.json");

type Compiled = CacheRecord & { cached: boolean };

/** A contract that was not scored. `tolerated` skips are part of the design; the rest make the run fail. */
type Skip = { slug: string; why: string; tolerated: boolean; excluded: boolean };

class CacheUnavailable extends Error {}

async function compile(spec: EvalSpec, pdfPath: string, pages: string[]): Promise<Compiled> {
  const sha = textSha256(pages);
  if (!fresh) {
    const hit = readCache(cacheDir, spec.slug, { promptVersion: PROMPT_VERSION, model: MODEL, textSha256: sha });
    if (hit.status === "hit") return { ...hit.record, cached: true };
    if (cacheOnly) throw new CacheUnavailable(hit.status === "stale" ? `cached extraction is stale: ${hit.reason}` : "no cached extraction");
    if (hit.status === "stale") console.warn(`${spec.slug}: ${hit.reason}; extracting again`);
  }
  const { extractRuleSet } = await import("../src/lib/ai/extractRuleSet");
  const r = await extractRuleSet(new Uint8Array(readFileSync(pdfPath)));
  const record: CacheRecord = { extracted: r.extracted, model: r.model, ms: r.ms, promptVersion: r.promptVersion, textSha256: sha, usage: r.usage as CacheRecord["usage"], at: new Date().toISOString() };
  writeCache(cacheDir, spec.slug, record);
  return { ...record, cached: false };
}

function provenance(meta: Map<string, Compiled>): Provenance {
  const all = [...meta.values()];
  const times = all.map((c) => c.at).filter((t): t is string => !!t).sort();
  return {
    models: [...new Set(all.map((c) => c.model))].sort(),
    promptVersions: [...new Set(all.map((c) => c.promptVersion ?? "(unrecorded)"))].sort(),
    extractedFrom: times[0] ?? null,
    extractedTo: times.at(-1) ?? null,
  };
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
    lines.push(`| ${r.slug} | ${r.category} | ${r.fields.filter((f) => f.correct).length}/${r.fields.length} | ${c.layers.L3.silentErrors} | ${k.model} | ${(k.ms / 1000).toFixed(1)}s |`);
  }
  const misses = results.flatMap((r) => r.fields.filter((f) => !f.correct).map((f) => `| ${r.slug} | \`${f.path}\` | ${JSON.stringify(f.expected)} | ${JSON.stringify(f.actual)} | ${f.confidence ?? "—"} | ${f.flagged.L3 ? "flagged" : "**silent**"} |`));
  if (misses.length) lines.push("", "## Every miss", "", "| Contract | Field | Expected | Got | Model confidence | Production policy |", "|---|---|---|---|---|---|", ...misses);
  lines.push("", "Synthetic contracts are generated from their spec, so the spec is the answer key; they measure extraction fidelity, not real-world distribution. Real forms are hand-labeled (see evals/real/README.md).");
  return lines.join("\n");
}

async function main() {
  const specs = loadSpecs(process.cwd(), only);
  const meta = new Map<string, Compiled>();
  const skips: Skip[] = [];
  const skip = (slug: string, why: string, kind: "excluded" | "unavailable" | "failed") => {
    skips.push({ slug, why, tolerated: kind !== "failed", excluded: kind === "excluded" });
    console.warn(`skip ${slug}: ${why}`);
    return null;
  };
  const scored = await pool(specs, CONCURRENCY, async ({ spec, pdf, pdfOptional }) => {
    if (!existsSync(pdf)) {
      const why = `${path.relative(process.cwd(), pdf)} missing`;
      return pdfOptional ? skip(spec.slug, `${why} (third-party form, fetched with pnpm eval:fetch)`, "unavailable") : skip(spec.slug, why, "failed");
    }
    const auditFile = pdf.replace(/\.pdf$/, ".audit.json");
    if (existsSync(auditFile) && !(JSON.parse(readFileSync(auditFile, "utf8")) as { passed: boolean }).passed) {
      return skip(spec.slug, "the generated draft failed its audit against the brief, so its answer key is not trustworthy", "excluded");
    }
    const { pages } = await extractPageTexts(new Uint8Array(readFileSync(pdf)));
    try {
      const c = await compile(spec, pdf, pages);
      ExtractedRuleSetSchema.parse(c.extracted);
      meta.set(spec.slug, c);
      return scoreContract(spec, c.extracted, pages);
    } catch (e) {
      // A missing or stale cache record, or an extraction the model failed to produce. Neither is scored,
      // so neither may pass quietly: the run exits non-zero below.
      return skip(spec.slug, (e as Error).message, "failed");
    }
  });
  const results = scored.filter((r): r is ContractResult => r !== null);
  if (!results.length) {
    console.error("No contracts scored. Set ANTHROPIC_API_KEY or populate evals/cache.");
    process.exit(1);
  }
  const md = report(results, meta);
  console.log(md);

  const failed = skips.filter((s) => !s.tolerated);
  const unavailable = skips.filter((s) => s.tolerated && !s.excluded);
  const complete = !only && !failed.length && !unavailable.length;
  const committed: RunFile | null = existsSync(LATEST) ? parseRun(JSON.parse(readFileSync(LATEST, "utf8")), "evals/results/latest.json") : null;
  const { changes, notRescored, reproduces } = compareToRecord(committed?.results ?? null, results, complete);

  console.error("");
  if (failed.length) console.error(`${failed.length} contract(s) could not be scored: ${failed.map((s) => s.slug).join(", ")}`);

  if (check) {
    if (!committed) {
      console.error("check: evals/results/latest.json does not exist.");
      process.exit(1);
    }
    for (const line of changes) console.error(`  ${line}`);
    if (complete) for (const s of notRescored) console.error(`  ${s}: in the committed results, no longer in the dataset`);
    if (!reproduces || failed.length) {
      console.error(`check: FAILED. Re-scoring the cache does not reproduce evals/results/latest.json (${changes.length} difference(s)).`);
      process.exit(1);
    }
    console.error(`check: ok. ${results.length} of ${committed.results.length} committed contracts re-scored from the cache, all identical.${notRescored.length ? ` Not re-scored here: ${notRescored.join(", ")}.` : ""}`);
    return;
  }

  const anyFresh = [...meta.values()].some((c) => !c.cached);
  const run: RunFile = { at: new Date().toISOString().replace(/[:.]/g, "-"), metrics: metrics(results), results, provenance: provenance(meta) };
  const plan = planWrite({ complete, reproduces, anyFresh });
  mkdirSync(path.resolve("evals/results"), { recursive: true });
  if (plan.stamped) writeFileSync(path.resolve("evals/results", `${run.at}.json`), JSON.stringify(run, null, 2));
  if (plan.latest) {
    // Committed copy, so the app and /api/v1/eval can show the run without re-running it.
    writeFileSync(LATEST, JSON.stringify(run, null, 2));
    writeFileSync(path.resolve("evals/results", "latest.md"), md + "\n");
    console.error(`Wrote evals/results/latest.json and latest.md (${changes.length} field difference(s) from the previous record). Run pnpm eval:report and pnpm eval:gate.`);
  } else if (!complete) {
    console.error(`Partial run (${only ? `--only=${only}` : `${failed.length + unavailable.length} contract(s) not scored`}): evals/results/latest.* left as committed.`);
  } else {
    console.error("Scores are identical to evals/results/latest.json; nothing written.");
  }
  if (failed.length) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
