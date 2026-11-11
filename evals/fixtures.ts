/** Hand-built scored contracts for the eval's own unit tests. No PDFs, no model. */
import { RULE_FIELDS } from "../src/domain/rules/schema";
import { metrics, type ContractResult, type FieldResult } from "./score";
import type { RunFile } from "./run-file";

const NONE = { L0: false, L1: false, L2: false, L3: false };

/** A contract whose 21 fields are all correct, quoted, verified, high-confidence and unflagged, then patched per field. */
export function contract(slug: string, patch: Partial<Record<(typeof RULE_FIELDS)[number], Partial<FieldResult>>> = {}, category = "synthetic"): ContractResult {
  return {
    slug,
    category,
    fields: RULE_FIELDS.map((path) => ({ path, expected: "x", actual: "x", correct: true, confidence: "high" as const, quoted: true, quoteVerified: true, flagged: { ...NONE }, ...patch[path] })),
  };
}

/** A confidently wrong field nothing flags. */
export const SILENT: Partial<FieldResult> = { actual: "y", correct: false };
/** A wrong field the production policy sends to a person. */
export const CAUGHT: Partial<FieldResult> = { actual: "y", correct: false, flagged: { L0: false, L1: false, L2: false, L3: true } };

export function runOf(results: ContractResult[]): RunFile {
  return { at: "2026-01-01T00-00-00-000Z", metrics: metrics(results), results };
}
