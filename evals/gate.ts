/**
 * Regression gate for the extraction eval. Pure: give it a parsed results file and thresholds, get
 * back one row per check. scripts/eval-gate.ts is the command-line wrapper (`pnpm eval:gate`).
 *
 * The gate reads the per-field results and recomputes every metric from them, so a results file
 * whose summary numbers were edited by hand fails rather than passes. Dataset-size floors are part
 * of the gate because every rate here can be improved by scoring fewer contracts.
 */
import { z } from "zod";
import { metricsDrift, type RunFile } from "./run-file";
import { LAYERS, metrics } from "./score";

export const ThresholdsSchema = z.object({
  source: z.string().optional(),
  note: z.string().optional(),
  /** Fewest contracts and fields the run may score. */
  minContracts: z.number().int().nonnegative(),
  minFields: z.number().int().nonnegative(),
  /** Lowest value accuracy (correct fields / all fields). */
  minAccuracy: z.number().min(0).max(1),
  /** Lowest share of quoted fields whose quote is found in the PDF. */
  minQuoteVerifiedRate: z.number().min(0).max(1),
  /** Most wrong fields the production review policy (L3) may leave unflagged, as a count. */
  maxSilentErrors: z.number().int().nonnegative(),
  /** Highest share of fields the production policy may send to a person: flagging everything is not a fix. */
  maxReviewBurden: z.number().min(0).max(1),
});
export type Thresholds = z.infer<typeof ThresholdsSchema>;

export type GateCheck = { name: string; actual: string; required: string; pass: boolean; detail?: string };
export type GateResult = { pass: boolean; checks: GateCheck[] };

const pct = (x: number) => `${(100 * x).toFixed(2)}%`;

export function evaluateGate(run: RunFile, t: Thresholds): GateResult {
  const m = metrics(run.results);
  const wrong = run.results.flatMap((r) => r.fields.filter((f) => !f.correct).map((f) => ({ slug: r.slug, ...f })));
  const silent = wrong.filter((f) => !f.flagged.L3);
  const drift = metricsDrift(run);
  const silentByLayer = LAYERS.map((l) => m.layers[l].silentErrors);
  const monotonic = silentByLayer.every((n, i) => i === 0 || n <= silentByLayer[i - 1]);

  const checks: GateCheck[] = [
    {
      name: "Summary metrics match the per-field results",
      actual: drift.length ? `${drift.length} mismatch(es)` : "consistent",
      required: "consistent",
      pass: drift.length === 0,
      detail: drift.join("\n") || undefined,
    },
    {
      name: "Each review layer leaves no more silent errors than the one before",
      actual: silentByLayer.join(" >= "),
      required: "non-increasing L0..L3",
      pass: monotonic,
    },
    { name: "Contracts scored", actual: String(m.contracts), required: `>= ${t.minContracts}`, pass: m.contracts >= t.minContracts },
    { name: "Fields scored", actual: String(m.fields), required: `>= ${t.minFields}`, pass: m.fields >= t.minFields },
    {
      name: "Value accuracy",
      actual: `${pct(m.accuracy)} (${m.fields - m.wrong}/${m.fields})`,
      required: `>= ${pct(t.minAccuracy)}`,
      pass: m.accuracy >= t.minAccuracy,
      detail: m.accuracy >= t.minAccuracy ? undefined : wrong.map((f) => `wrong: ${f.slug} ${f.path}`).join("\n"),
    },
    {
      name: "Quotes verified in the PDF",
      actual: m.quoteVerifiedRate === null ? "n/a (no quoted fields)" : pct(m.quoteVerifiedRate),
      required: `>= ${pct(t.minQuoteVerifiedRate)}`,
      pass: m.quoteVerifiedRate !== null && m.quoteVerifiedRate >= t.minQuoteVerifiedRate,
    },
    {
      name: "Silent errors under the production policy (L3)",
      actual: String(silent.length),
      required: `<= ${t.maxSilentErrors}`,
      pass: silent.length <= t.maxSilentErrors,
      detail: silent.length <= t.maxSilentErrors ? undefined : silent.map((f) => `silent: ${f.slug} ${f.path} expected ${JSON.stringify(f.expected)} got ${JSON.stringify(f.actual)}`).join("\n"),
    },
    {
      name: "Review burden under the production policy (L3)",
      actual: pct(m.layers.L3.burden),
      required: `<= ${pct(t.maxReviewBurden)}`,
      pass: m.layers.L3.burden <= t.maxReviewBurden,
    },
  ];
  return { pass: checks.every((c) => c.pass), checks };
}

export function formatGate(result: GateResult): string {
  const lines = result.checks.flatMap((c) => [
    `${c.pass ? "ok  " : "FAIL"}  ${c.name}: ${c.actual} (required ${c.required})`,
    ...(c.detail ? c.detail.split("\n").map((d) => `        ${d}`) : []),
  ]);
  const failed = result.checks.filter((c) => !c.pass).length;
  lines.push("", result.pass ? "Eval gate passed." : `Eval gate FAILED: ${failed} of ${result.checks.length} checks. Thresholds are in evals/thresholds.json.`);
  return lines.join("\n");
}
