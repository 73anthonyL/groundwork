/**
 * Write evals/results/REPORT.md from the committed results, thresholds and cache records.
 *   pnpm eval:report            regenerate the report
 *   pnpm eval:report --check    fail if the committed report is not what the inputs produce
 * Reads files only; never calls the model. Output is deterministic.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { CacheRecord } from "../evals/cache";
import { ThresholdsSchema } from "../evals/gate";
import { renderReport, type Extraction } from "../evals/report";
import { parseRun } from "../evals/run-file";

const RESULTS = "evals/results/latest.json";
const OUT = "evals/results/REPORT.md";
const cacheDir = path.resolve(process.env.EVAL_CACHE_DIR ?? "evals/cache");

const run = parseRun(JSON.parse(readFileSync(path.resolve(RESULTS), "utf8")), RESULTS);
const thresholds = ThresholdsSchema.parse(JSON.parse(readFileSync(path.resolve("evals/thresholds.json"), "utf8")));
const extractions: Extraction[] = run.results.flatMap((r) => {
  const file = path.join(cacheDir, `${r.slug}.json`);
  if (!existsSync(file)) return [];
  const c = JSON.parse(readFileSync(file, "utf8")) as CacheRecord;
  return [{ slug: r.slug, model: c.model, promptVersion: c.promptVersion ?? null, ms: c.ms, inputTokens: c.usage?.input_tokens ?? null, outputTokens: c.usage?.output_tokens ?? null, at: c.at ?? null }];
});

const md = renderReport(run, { thresholds, extractions, source: RESULTS });
if (process.argv.includes("--check")) {
  const committed = existsSync(OUT) ? readFileSync(OUT, "utf8") : null;
  if (committed !== md) {
    console.error(`${OUT} is out of date with ${RESULTS}, evals/thresholds.json or evals/cache. Run pnpm eval:report and commit the result.`);
    process.exit(1);
  }
  console.log(`${OUT} is up to date.`);
} else {
  writeFileSync(path.resolve(OUT), md);
  console.log(`wrote ${OUT}`);
}
