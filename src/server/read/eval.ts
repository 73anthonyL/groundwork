/** The latest extraction eval run, read from evals/results (written by `pnpm eval`). */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import type { ContractResult, Metrics } from "../../../evals/score";
import { LAYERS, LAYER_LABEL } from "../../../evals/score";

export type EvalRun = {
  at: string;
  metrics: Metrics;
  layers: { id: string; label: string; silentErrors: number; silentRate: number | null; catchRate: number | null; burden: number | null }[];
  contracts: { slug: string; category: string; correct: number; fields: number; silent: number }[];
  misses: { slug: string; path: string; expected: unknown; actual: unknown; confidence: string | null; flagged: boolean }[];
};

export function latestEval(dir = path.resolve("evals/results")): EvalRun | null {
  if (!existsSync(dir)) return null;
  // Timestamped runs sort oldest first; latest.json (the committed copy) is tried last-resort first.
  const files = readdirSync(dir).filter((f) => f.endsWith(".json") && f !== "latest.json").sort();
  if (existsSync(path.join(dir, "latest.json"))) files.unshift("latest.json");
  for (const f of files.reverse()) {
    try {
      const raw = JSON.parse(readFileSync(path.join(dir, f), "utf8")) as { at: string; metrics: Metrics; results: ContractResult[] };
      if (!raw.results?.length || !raw.metrics?.layers) continue;
      return {
        at: raw.at,
        metrics: raw.metrics,
        layers: LAYERS.map((id) => ({ id, label: LAYER_LABEL[id], ...raw.metrics.layers[id] })),
        contracts: raw.results.map((r) => ({ slug: r.slug, category: r.category, correct: r.fields.filter((x) => x.correct).length, fields: r.fields.length, silent: r.fields.filter((x) => !x.correct && !x.flagged.L3).length })),
        misses: raw.results.flatMap((r) => r.fields.filter((x) => !x.correct).map((x) => ({ slug: r.slug, path: x.path, expected: x.expected, actual: x.actual, confidence: x.confidence, flagged: x.flagged.L3 }))),
      };
    } catch {
      continue;
    }
  }
  return null;
}
