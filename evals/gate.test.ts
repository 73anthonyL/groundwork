import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CAUGHT, contract, runOf, SILENT } from "./fixtures";
import { evaluateGate, formatGate, ThresholdsSchema, type Thresholds } from "./gate";
import { parseRun } from "./run-file";

const T: Thresholds = { minContracts: 4, minFields: 84, minAccuracy: 0.98, minQuoteVerifiedRate: 0.99, maxSilentErrors: 0, maxReviewBurden: 0.1 };
const clean = () => [contract("a"), contract("b"), contract("c"), contract("d")];
const failing = (run: ReturnType<typeof runOf>, t = T) => evaluateGate(run, t).checks.filter((c) => !c.pass).map((c) => c.name);

describe("evaluateGate", () => {
  it("passes a run at or above every threshold", () => {
    const r = evaluateGate(runOf(clean()), T);
    expect(r.pass).toBe(true);
    expect(formatGate(r)).toContain("Eval gate passed.");
  });

  it("fails when accuracy drops below the floor, and names the wrong fields", () => {
    const rs = clean();
    rs[0] = contract("a", { "timing.days": CAUGHT, "timing.type": CAUGHT });
    const r = evaluateGate(runOf(rs), T); // 82/84 = 97.6%
    expect(failing(runOf(rs))).toEqual(["Value accuracy"]);
    expect(formatGate(r)).toContain("wrong: a timing.days");
    expect(formatGate(r)).toContain("Eval gate FAILED: 1 of 8 checks");
  });

  it("fails on one silent error more than allowed even when accuracy still passes", () => {
    const rs = clean();
    rs[1] = contract("b", { "retainage.percent_bps": SILENT });
    const r = evaluateGate(runOf(rs), T); // 83/84 = 98.8%
    expect(failing(runOf(rs))).toEqual(["Silent errors under the production policy (L3)"]);
    expect(formatGate(r)).toContain('silent: b retainage.percent_bps expected "x" got "y"');
  });

  it("counts a wrong field the production policy flags as an accuracy miss, not a silent error", () => {
    const rs = clean();
    rs[1] = contract("b", { "retainage.percent_bps": CAUGHT });
    expect(evaluateGate(runOf(rs), T).pass).toBe(true);
  });

  it("fails when quotes stop verifying, and when no field carries a quote at all", () => {
    const rs = clean();
    rs[2] = contract("c", { "timing.days": { quoteVerified: false } });
    expect(failing(runOf(rs))).toEqual(["Quotes verified in the PDF"]);
    const unquoted = clean().map((r) => ({ ...r, fields: r.fields.map((f) => ({ ...f, quoted: false, quoteVerified: false })) }));
    expect(failing(runOf(unquoted))).toEqual(["Quotes verified in the PDF"]);
  });

  it("fails when silent errors are bought by flagging everything", () => {
    const flagAll = clean().map((r) => ({ ...r, fields: r.fields.map((f) => ({ ...f, flagged: { L0: false, L1: false, L2: false, L3: true } })) }));
    expect(failing(runOf(flagAll))).toEqual(["Review burden under the production policy (L3)"]);
  });

  it("fails when the dataset shrinks, since every rate improves by scoring less", () => {
    expect(failing(runOf(clean().slice(0, 3)))).toEqual(["Contracts scored", "Fields scored"]);
  });

  it("fails a results file whose summary was edited without the per-field results", () => {
    const rs = clean();
    rs[0] = contract("a", { "timing.days": SILENT });
    const run = runOf(rs);
    run.metrics = { ...run.metrics, accuracy: 1, wrong: 0 };
    const r = evaluateGate(run, { ...T, maxSilentErrors: 1 });
    expect(r.checks[0].pass).toBe(false);
    expect(r.checks[0].detail).toContain("metrics.accuracy");
  });

  it("fails when a later review layer leaves more silent errors than an earlier one", () => {
    const rs = clean();
    rs[0] = contract("a", { "timing.days": { actual: "y", correct: false, flagged: { L0: false, L1: true, L2: true, L3: false } } });
    expect(failing(runOf(rs), { ...T, maxSilentErrors: 1 })).toEqual(["Each review layer leaves no more silent errors than the one before"]);
  });

  it("does not divide by zero on an empty run", () => {
    const r = evaluateGate(runOf([]), { ...T, minContracts: 0, minFields: 0, minAccuracy: 0 });
    expect(r.checks.find((c) => c.name === "Quotes verified in the PDF")!.actual).toBe("n/a (no quoted fields)");
    expect(formatGate(r)).not.toContain("NaN");
  });
});

describe("ThresholdsSchema", () => {
  it("rejects a rate outside 0..1 and a missing bound", () => {
    expect(ThresholdsSchema.safeParse({ ...T, minAccuracy: 99 }).success).toBe(false);
    expect(ThresholdsSchema.safeParse({ ...T, maxSilentErrors: undefined }).success).toBe(false);
  });
});

describe("the committed run against the committed thresholds", () => {
  const run = parseRun(JSON.parse(readFileSync("evals/results/latest.json", "utf8")));
  const thresholds = ThresholdsSchema.parse(JSON.parse(readFileSync("evals/thresholds.json", "utf8")));

  it("passes", () => {
    const r = evaluateGate(run, thresholds);
    expect(r.checks.filter((c) => !c.pass)).toEqual([]);
  });

  it("is tight: one more wrong field fails, and a silent one fails twice", () => {
    const flip = (flagged: boolean) => {
      const copy = structuredClone(run);
      const f = copy.results.flatMap((r) => r.fields).find((x) => x.correct && !x.flagged.L3)!;
      f.correct = false;
      f.flagged = { L0: false, L1: flagged, L2: flagged, L3: flagged };
      copy.metrics = runOf(copy.results).metrics;
      return evaluateGate(copy, thresholds).checks.filter((c) => !c.pass).map((c) => c.name);
    };
    expect(flip(true)).toContain("Value accuracy");
    expect(flip(false)).toEqual(["Value accuracy", "Silent errors under the production policy (L3)"]);
  });
});
