/**
 * The shape of evals/results/latest.json (the committed record of a run) and the comparisons made
 * against it. Pure: no I/O.
 */
import { metrics, type ContractResult, type Metrics } from "./score";

export type Provenance = {
  /** Distinct model ids the extractions were made with, as returned by the API. */
  models: string[];
  /** Distinct prompt versions the extractions were made with. */
  promptVersions: string[];
  /** ISO times of the first and last model call behind the run. */
  extractedFrom: string | null;
  extractedTo: string | null;
};

export type RunFile = {
  /** When the results file was written. */
  at: string;
  metrics: Metrics;
  results: ContractResult[];
  /** Absent on files written before provenance was recorded; the cache records carry the same facts. */
  provenance?: Provenance;
};

/** Validate the parts every consumer relies on, with a message that says what is wrong. */
export function parseRun(json: unknown, source = "results file"): RunFile {
  const run = json as Partial<RunFile> | null;
  if (!run || typeof run !== "object") throw new Error(`${source}: not a JSON object`);
  if (!Array.isArray(run.results)) throw new Error(`${source}: "results" is missing`);
  if (!run.metrics || typeof run.metrics !== "object" || !run.metrics.layers) throw new Error(`${source}: "metrics" is missing`);
  for (const r of run.results) {
    if (typeof r.slug !== "string" || typeof r.category !== "string" || !Array.isArray(r.fields)) throw new Error(`${source}: a result is missing slug, category or fields`);
  }
  return run as RunFile;
}

/** Field-level differences between two sets of scored contracts, as readable lines. Empty when identical. */
export function diffResults(committed: ContractResult[], current: ContractResult[]): string[] {
  const out: string[] = [];
  const before = new Map(committed.map((r) => [r.slug, r]));
  for (const now of current) {
    const was = before.get(now.slug);
    if (!was) {
      out.push(`${now.slug}: scored now, absent from the committed results`);
      continue;
    }
    if (was.category !== now.category) out.push(`${now.slug}: category ${was.category} -> ${now.category}`);
    const wasFields = new Map(was.fields.map((f) => [f.path, f]));
    if (was.fields.length !== now.fields.length) out.push(`${now.slug}: ${was.fields.length} fields -> ${now.fields.length}`);
    for (const f of now.fields) {
      const w = wasFields.get(f.path);
      if (!w) out.push(`${now.slug} ${f.path}: absent from the committed results`);
      else if (JSON.stringify(w) !== JSON.stringify(f)) {
        const keys = (Object.keys(f) as (keyof typeof f)[]).filter((k) => JSON.stringify(w[k]) !== JSON.stringify(f[k]));
        out.push(`${now.slug} ${f.path}: ${keys.map((k) => `${k} ${JSON.stringify(w[k])} -> ${JSON.stringify(f[k])}`).join("; ")}`);
      }
    }
  }
  return out;
}

/** Stored summary metrics that disagree with the per-field results they summarise (a hand-edited file). */
export function metricsDrift(run: RunFile): string[] {
  const fresh = metrics(run.results);
  const flat = (m: Metrics): Record<string, unknown> => ({
    contracts: m.contracts,
    fields: m.fields,
    wrong: m.wrong,
    accuracy: m.accuracy,
    quoteVerifiedRate: m.quoteVerifiedRate,
    calibration: m.calibration,
    ...Object.fromEntries(Object.entries(m.layers).flatMap(([l, x]) => Object.entries(x).map(([k, v]) => [`layers.${l}.${k}`, v]))),
  });
  const a = flat(run.metrics);
  const b = flat(fresh);
  return Object.keys(b)
    .filter((k) => a[k] !== b[k])
    .map((k) => `metrics.${k}: file says ${JSON.stringify(a[k])}, the results give ${JSON.stringify(b[k])}`);
}

/**
 * How a run relates to the committed record. Contracts in the record that the run did not score
 * count against it only when the run is complete: a partial run cannot say they were removed.
 */
export function compareToRecord(committed: ContractResult[] | null, current: ContractResult[], complete: boolean): { changes: string[]; notRescored: string[]; reproduces: boolean } {
  if (!committed) return { changes: [], notRescored: [], reproduces: false };
  const changes = diffResults(committed, current);
  const scored = new Set(current.map((r) => r.slug));
  const notRescored = committed.map((r) => r.slug).filter((s) => !scored.has(s));
  return { changes, notRescored, reproduces: !changes.length && (!complete || !notRescored.length) };
}

/**
 * Which files a run may write. evals/results/latest.* is the committed record: only a complete run
 * whose scores differ from it replaces it, so re-scoring the cache leaves the tree clean and a partial
 * run (--only, a missing PDF, a failed extraction) cannot overwrite the record with a subset.
 * Timestamped copies are local history: written when the model was called or the scores changed.
 */
export function planWrite(run: { complete: boolean; reproduces: boolean; anyFresh: boolean }): { latest: boolean; stamped: boolean } {
  return { latest: run.complete && !run.reproduces, stamped: run.anyFresh || !run.reproduces };
}
