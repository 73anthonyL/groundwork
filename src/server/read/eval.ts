/**
 * The latest extraction eval run. `pnpm eval` writes evals/results/latest.json, which is committed,
 * so the app shows the run it was built with and needs no filesystem access at request time.
 */
import raw from "../../../evals/results/latest.json";
import type { ContractResult, Metrics } from "../../../evals/score";
import { LAYERS, LAYER_LABEL } from "../../../evals/score";

export type EvalRun = {
  at: string;
  metrics: Metrics;
  layers: { id: string; label: string; silentErrors: number; silentRate: number | null; catchRate: number | null; burden: number | null }[];
  contracts: { slug: string; category: string; correct: number; fields: number; silent: number }[];
  misses: { slug: string; path: string; expected: unknown; actual: unknown; confidence: string | null; flagged: boolean }[];
};

export function latestEval(): EvalRun | null {
  const run = raw as unknown as { at: string; metrics: Metrics; results: ContractResult[] };
  if (!run.results?.length || !run.metrics?.layers) return null;
  return {
    at: run.at,
    metrics: run.metrics,
    layers: LAYERS.map((id) => ({ id, label: LAYER_LABEL[id], ...run.metrics.layers[id] })),
    contracts: run.results.map((r) => ({ slug: r.slug, category: r.category, correct: r.fields.filter((x) => x.correct).length, fields: r.fields.length, silent: r.fields.filter((x) => !x.correct && !x.flagged.L3).length })),
    misses: run.results.flatMap((r) => r.fields.filter((x) => !x.correct).map((x) => ({ slug: r.slug, path: x.path, expected: x.expected, actual: x.actual, confidence: x.confidence, flagged: x.flagged.L3 }))),
  };
}
