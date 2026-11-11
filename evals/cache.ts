/**
 * The extraction cache: one JSON record per contract in evals/cache, written by a live run and
 * committed, so the eval can be re-scored without calling the model.
 *
 * A record is only an answer to "what does the current extractor say about this contract" while the
 * things that produced it are unchanged. The file name is the contract slug, so the record itself
 * carries what it was produced with, and `readCache` refuses a record whose prompt version or model
 * differs from the code's, or whose contract text has changed. A refused record is "stale": a live
 * run re-extracts it, a cache-only run reports it instead of scoring an extraction the current
 * prompt never made.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { ExtractedRuleSet } from "../src/domain/rules/schema";

export type CacheRecord = {
  extracted: ExtractedRuleSet;
  /** Model id as returned by the API. */
  model: string;
  ms: number;
  /** PROMPT_VERSION of src/lib/ai/extractRuleSet.ts at extraction time. */
  promptVersion?: string;
  /** `textSha256` of the contract's page texts at extraction time. Absent on records written before it was recorded. */
  textSha256?: string;
  usage?: { input_tokens?: number; output_tokens?: number };
  /** ISO time of the model call. */
  at?: string;
};

export type CacheExpectation = { promptVersion: string; model: string; textSha256?: string };

export type CacheLookup = { status: "hit"; record: CacheRecord } | { status: "miss" } | { status: "stale"; record: CacheRecord; reason: string };

export const cacheFile = (cacheDir: string, slug: string) => path.join(cacheDir, `${slug}.json`);

/**
 * Hash of the contract's wording: all page texts joined, whitespace collapsed. Layout (line and page
 * breaks) is left out on purpose, because CI re-renders the seed PDFs and a renderer may break lines
 * differently on another platform without changing a word.
 */
export function textSha256(pageTexts: string[]): string {
  return createHash("sha256").update(pageTexts.join(" ").replace(/\s+/g, " ").trim()).digest("hex");
}

/** Why a record no longer describes the current extractor, or null when it does. */
export function staleReason(record: CacheRecord, want: CacheExpectation): string | null {
  if (record.promptVersion !== want.promptVersion) return `extracted with prompt ${record.promptVersion ?? "(unrecorded)"}, the code is at ${want.promptVersion}`;
  // The API may return a dated id for an alias, so the configured model need only be a prefix.
  if (!record.model?.startsWith(want.model)) return `extracted with model ${record.model ?? "(unrecorded)"}, the code is configured for ${want.model}`;
  if (record.textSha256 && want.textSha256 && record.textSha256 !== want.textSha256) return "the contract text has changed since it was extracted";
  return null;
}

export function readCache(cacheDir: string, slug: string, want: CacheExpectation): CacheLookup {
  const file = cacheFile(cacheDir, slug);
  if (!existsSync(file)) return { status: "miss" };
  const record = JSON.parse(readFileSync(file, "utf8")) as CacheRecord;
  const reason = staleReason(record, want);
  return reason ? { status: "stale", record, reason } : { status: "hit", record };
}

export function writeCache(cacheDir: string, slug: string, record: CacheRecord): void {
  writeFileSync(cacheFile(cacheDir, slug), JSON.stringify(record, null, 2));
}
