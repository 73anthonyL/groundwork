import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { readCache, staleReason, textSha256, writeCache, type CacheRecord } from "./cache";
import type { ExtractedRuleSet } from "../src/domain/rules/schema";

const dir = mkdtempSync(path.join(tmpdir(), "eval-cache-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const want = { promptVersion: "extract-v2", model: "claude-test-1" };
const record = (over: Partial<CacheRecord> = {}): CacheRecord => ({ extracted: {} as ExtractedRuleSet, model: "claude-test-1", ms: 1, promptVersion: "extract-v2", ...over });

describe("staleReason", () => {
  it("accepts a record made with the current prompt and model", () => {
    expect(staleReason(record(), want)).toBeNull();
  });

  it("refuses a record made with another prompt version, or with none recorded", () => {
    expect(staleReason(record({ promptVersion: "extract-v1" }), want)).toContain("prompt extract-v1");
    expect(staleReason(record({ promptVersion: undefined }), want)).toContain("(unrecorded)");
  });

  it("refuses a record made with another model, but accepts a dated id of the configured one", () => {
    expect(staleReason(record({ model: "claude-other-9" }), want)).toContain("model claude-other-9");
    expect(staleReason(record({ model: "claude-test-1-20260101" }), want)).toBeNull();
  });

  it("refuses a record whose contract text has changed, when the record carries a hash", () => {
    const sha = textSha256(["page one", "page two"]);
    expect(staleReason(record({ textSha256: sha }), { ...want, textSha256: sha })).toBeNull();
    expect(staleReason(record({ textSha256: sha }), { ...want, textSha256: textSha256(["page one", "page 2"]) })).toContain("contract text has changed");
    // Records written before the hash was recorded cannot be checked this way; pnpm eval:check covers them.
    expect(staleReason(record(), { ...want, textSha256: sha })).toBeNull();
  });
});

describe("textSha256", () => {
  it("changes with the wording, not with line or page breaks", () => {
    expect(textSha256(["retention of five\npercent", "of each payment"])).toBe(textSha256(["retention of five percent of each", "payment"]));
    expect(textSha256(["retention of five percent"])).not.toBe(textSha256(["retention of ten percent"]));
  });
});

describe("readCache", () => {
  it("misses, hits, and reports a stale record with its reason", () => {
    expect(readCache(dir, "nothing", want)).toEqual({ status: "miss" });
    writeCache(dir, "one", record());
    expect(readCache(dir, "one", want).status).toBe("hit");
    const stale = readCache(dir, "one", { ...want, promptVersion: "extract-v3" });
    expect(stale.status).toBe("stale");
    expect(stale.status === "stale" && stale.reason).toContain("the code is at extract-v3");
  });
});
