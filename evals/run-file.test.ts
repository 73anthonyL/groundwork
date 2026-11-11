import { describe, expect, it } from "vitest";
import { CAUGHT, contract, runOf, SILENT } from "./fixtures";
import { compareToRecord, diffResults, metricsDrift, parseRun, planWrite } from "./run-file";

describe("parseRun", () => {
  it("says what is missing", () => {
    expect(() => parseRun(null, "latest.json")).toThrow("latest.json: not a JSON object");
    expect(() => parseRun({ metrics: {} })).toThrow('"results" is missing');
    expect(() => parseRun({ results: [] })).toThrow('"metrics" is missing');
    expect(parseRun(JSON.parse(JSON.stringify(runOf([contract("a")])))).results).toHaveLength(1);
  });
});

describe("diffResults", () => {
  it("is empty for identical results, whatever the key order of the JSON", () => {
    const a = [contract("a"), contract("b", { "timing.days": CAUGHT })];
    expect(diffResults(a, JSON.parse(JSON.stringify(a)))).toEqual([]);
  });

  it("names the contract, field and property that changed", () => {
    const was = [contract("a")];
    const now = [contract("a", { "timing.days": SILENT })];
    expect(diffResults(was, now)).toEqual(['a timing.days: actual "x" -> "y"; correct true -> false']);
  });

  it("reports a contract the record does not have", () => {
    expect(diffResults([contract("a")], [contract("a"), contract("new")])).toEqual(["new: scored now, absent from the committed results"]);
  });
});

describe("compareToRecord", () => {
  const record = [contract("a"), contract("b")];

  it("a partial run that matches the contracts it scored reproduces the record", () => {
    expect(compareToRecord(record, [contract("a")], false)).toEqual({ changes: [], notRescored: ["b"], reproduces: true });
  });

  it("a complete run that scores fewer contracts than the record does not", () => {
    expect(compareToRecord(record, [contract("a")], true).reproduces).toBe(false);
  });

  it("no record means nothing to reproduce", () => {
    expect(compareToRecord(null, record, true).reproduces).toBe(false);
  });
});

describe("planWrite", () => {
  it("re-scoring the cache with identical scores writes nothing", () => {
    expect(planWrite({ complete: true, reproduces: true, anyFresh: false })).toEqual({ latest: false, stamped: false });
  });

  it("a partial run never replaces the committed record", () => {
    expect(planWrite({ complete: false, reproduces: false, anyFresh: true }).latest).toBe(false);
    expect(planWrite({ complete: false, reproduces: true, anyFresh: false })).toEqual({ latest: false, stamped: false });
  });

  it("a complete run with different scores replaces it and keeps a timestamped copy", () => {
    expect(planWrite({ complete: true, reproduces: false, anyFresh: false })).toEqual({ latest: true, stamped: true });
  });
});

describe("metricsDrift", () => {
  it("is empty when the summary was computed from the results, across a JSON round trip", () => {
    const run = runOf([contract("a", { "timing.days": SILENT }), contract("b", { "timing.type": CAUGHT }), contract("c")]);
    expect(metricsDrift(JSON.parse(JSON.stringify(run)))).toEqual([]);
  });

  it("lists each summary number that disagrees with the results", () => {
    const run = runOf([contract("a", { "timing.days": SILENT })]);
    run.metrics.layers.L3 = { ...run.metrics.layers.L3, silentErrors: 0 };
    expect(metricsDrift(run)).toEqual(["metrics.layers.L3.silentErrors: file says 0, the results give 1"]);
  });
});
