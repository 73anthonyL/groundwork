/**
 * Pure scoring for the extraction eval. No I/O, no model: give it a spec (answer key), an extraction
 * and the PDF's page texts.
 *
 * The question this answers is not only "how often is the model right" but "how often does a wrong
 * value reach the engine without a human being asked to look at it". Each field is checked against
 * four review policies, each adding one layer:
 *   L0 trust      accept every value the model proposes
 *   L1 confidence flag anything the model marked medium/low, or proposed without evidence
 *   L2 + quotes   also flag quotes our verifier cannot find verbatim in the PDF
 *   L3 full       the production policy (annotate): + required-but-missing, anomalies, statutory conflicts
 * silent error = wrong value AND not flagged.  burden = share of fields a human must look at.
 */
import { RULE_FIELDS, getField, toValues, type ExtractedRuleSet, type RuleFieldPath } from "../src/domain/rules/schema";
import { annotate } from "../src/server/rules/review";
import type { ContractSpec } from "../src/domain/rules/from-spec";

export const LAYERS = ["L0", "L1", "L2", "L3"] as const;
export type Layer = (typeof LAYERS)[number];
export const LAYER_LABEL: Record<Layer, string> = {
  L0: "Trust the model",
  L1: "+ model confidence",
  L2: "+ quote verification",
  L3: "+ statute & anomalies (production)",
};

export type EvalSpec = ContractSpec & { category?: string; executedOn?: string };

export type FieldResult = {
  path: RuleFieldPath;
  expected: unknown;
  actual: unknown;
  correct: boolean;
  confidence: "high" | "medium" | "low" | null;
  quoted: boolean;
  quoteVerified: boolean;
  flagged: Record<Layer, boolean>;
};

export type ContractResult = { slug: string; category: string; fields: FieldResult[] };

const FREE_TEXT: RuleFieldPath[] = ["retainage.release_condition", "retainage.reduction_trigger", "parties.project"];
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Exact match after normalization; free-text fields need ≥70% of the expected tokens. */
export function same(path: RuleFieldPath, actual: unknown, expected: unknown): boolean {
  // "silent" and not-found say the same thing about a contract with no timing clause.
  if (path === "timing.type" && [actual, expected].every((v) => v === "silent" || v === null || v === undefined)) return true;
  if (actual === null || expected === null || actual === undefined || expected === undefined) return (actual ?? null) === (expected ?? null);
  if (typeof actual === "string" && typeof expected === "string") {
    if (FREE_TEXT.includes(path)) {
      const have = new Set(norm(actual).split(" "));
      const want = norm(expected).split(" ");
      return want.filter((t) => have.has(t)).length / Math.max(1, want.length) >= 0.7;
    }
    return norm(actual) === norm(expected);
  }
  return actual === expected;
}

const at = (o: unknown, path: string) => path.split(".").reduce<unknown>((x, k) => (x as Record<string, unknown> | null)?.[k], o);

export function scoreContract(spec: EvalSpec, extracted: ExtractedRuleSet, pageTexts: string[]): ContractResult {
  const stored = annotate(extracted, pageTexts, "CA", spec.executedOn ?? "2026-01-15");
  const got = toValues(extracted);
  const fields = RULE_FIELDS.map((path): FieldResult => {
    const f = getField(extracted, path);
    const ann = stored.annotations[path];
    const expected = at(spec.expected, path);
    const actual = at(got, path);
    const v = ann.verification;
    const quoteVerified = v.status === "exact" || (v.status === "fuzzy" && (v.score ?? 0) >= 0.95);
    const conf = f.evidence?.confidence ?? null;
    const L1 = (!f.not_found && !f.evidence) || conf === "medium" || conf === "low";
    const L2 = L1 || (!!f.evidence && !quoteVerified);
    const L3 = ann.review.state !== "auto_accepted";
    return {
      path,
      expected,
      actual,
      correct: same(path, actual, expected),
      confidence: conf,
      quoted: !!f.evidence,
      quoteVerified,
      // L3 is the production policy as shipped; it subsumes L1 and L2 (see review.ts), checked in score.test.ts.
      flagged: { L0: false, L1, L2, L3 },
    };
  });
  return { slug: spec.slug, category: spec.category ?? "synthetic", fields };
}

export type Metrics = {
  contracts: number;
  fields: number;
  accuracy: number;
  quoteVerifiedRate: number;
  /** Share of wrong fields marked medium/low by the model itself. */
  calibration: number | null;
  wrong: number;
  layers: Record<Layer, { silentErrors: number; silentRate: number; catchRate: number | null; burden: number }>;
};

export function metrics(results: ContractResult[]): Metrics {
  const all = results.flatMap((r) => r.fields);
  const wrong = all.filter((f) => !f.correct);
  const quoted = all.filter((f) => f.quoted);
  const ratio = (a: number, b: number) => (b ? a / b : 0);
  const layers = Object.fromEntries(
    LAYERS.map((l) => {
      const silent = wrong.filter((f) => !f.flagged[l]).length;
      return [l, { silentErrors: silent, silentRate: ratio(silent, all.length), catchRate: wrong.length ? 1 - silent / wrong.length : null, burden: ratio(all.filter((f) => f.flagged[l]).length, all.length) }];
    }),
  ) as Metrics["layers"];
  return {
    contracts: results.length,
    fields: all.length,
    accuracy: ratio(all.filter((f) => f.correct).length, all.length),
    quoteVerifiedRate: ratio(quoted.filter((f) => f.quoteVerified).length, quoted.length),
    calibration: wrong.length ? wrong.filter((f) => f.confidence === "medium" || f.confidence === "low").length / wrong.length : null,
    wrong: wrong.length,
    layers,
  };
}

/** Deterministic PRNG so CIs are reproducible run to run. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 95% percentile bootstrap over contracts (fields within a contract are not independent). */
export function bootstrap(results: ContractResult[], stat: (m: Metrics) => number | null, iters = 2000, seed = 7): [number, number] | null {
  if (results.length < 2) return null;
  const rand = mulberry32(seed);
  const xs: number[] = [];
  for (let i = 0; i < iters; i++) {
    const sample = results.map(() => results[Math.floor(rand() * results.length)]);
    const v = stat(metrics(sample));
    if (v !== null) xs.push(v);
  }
  xs.sort((a, b) => a - b);
  return [xs[Math.floor(0.025 * xs.length)], xs[Math.min(xs.length - 1, Math.floor(0.975 * xs.length))]];
}
