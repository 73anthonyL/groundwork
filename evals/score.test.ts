import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { extractPageTexts } from "../src/lib/pdf/text";
import { ruleSetFromSpec } from "../src/domain/rules/from-spec";
import type { ExtractedRuleSet } from "../src/domain/rules/schema";
import { bootstrap, LAYERS, metrics, same, scoreContract, type EvalSpec } from "./score";

const spec = JSON.parse(readFileSync("seed/specs/ironline-steel.json", "utf8")) as EvalSpec;
let pages: string[];
let perfect: ExtractedRuleSet;

beforeAll(async () => {
  pages = (await extractPageTexts(new Uint8Array(readFileSync("seed/contracts/ironline-steel.pdf")))).pages;
  perfect = ruleSetFromSpec(spec, pages);
});

const clone = (x: ExtractedRuleSet) => structuredClone(x);

describe("scoreContract", () => {
  it("a perfect extraction is 100% accurate with no silent errors", () => {
    const m = metrics([scoreContract(spec, perfect, pages)]);
    expect(m.accuracy).toBe(1);
    expect(m.quoteVerifiedRate).toBe(1);
    for (const l of LAYERS) expect(m.layers[l].silentErrors).toBe(0);
    expect(m.layers.L0.burden).toBe(0);
  });

  it("a confident wrong value with a fabricated quote slips past L0/L1 but is caught by quote verification", () => {
    const x = clone(perfect);
    x.retainage.percent_bps = { value: 500, not_found: false, evidence: { quote: "retention equal to five percent (5%) of each progress payment", page: 2, confidence: "high", rationale: "" } };
    const m = metrics([scoreContract(spec, x, pages)]);
    expect(m.wrong).toBe(1);
    expect(m.layers.L0.silentErrors).toBe(1);
    expect(m.layers.L1.silentErrors).toBe(1);
    expect(m.layers.L2.silentErrors).toBe(0);
    expect(m.layers.L3.silentErrors).toBe(0);
  });

  it("a wrong value the model hedged on is caught from L1 up, and counts toward calibration", () => {
    const x = clone(perfect);
    x.timing.days = { ...x.timing.days, value: 10, evidence: { ...x.timing.days.evidence!, confidence: "medium" } };
    const m = metrics([scoreContract(spec, x, pages)]);
    expect(m.layers.L0.silentErrors).toBe(1);
    expect(m.layers.L1.silentErrors).toBe(0);
    expect(m.calibration).toBe(1);
  });

  it("a confident misreading of a real clause is silent at every layer (the honest limit)", () => {
    const x = clone(perfect);
    x.timing.days = { ...x.timing.days, value: 10 }; // real, verified quote; wrong number
    const m = metrics([scoreContract(spec, x, pages)]);
    for (const l of LAYERS) expect(m.layers[l].silentErrors).toBe(1);
  });

  it("the production policy flags everything the simpler layers flag", () => {
    const x = clone(perfect);
    x.timing.days.evidence!.confidence = "low";
    x.retainage.percent_bps.evidence!.quote = "not in the contract at all";
    for (const f of scoreContract(spec, x, pages).fields) {
      if (f.flagged.L1 || f.flagged.L2) expect(f.flagged.L3).toBe(true);
    }
  });
});

describe("same", () => {
  it("normalizes case and punctuation; free text needs most expected tokens", () => {
    expect(same("parties.contractor", "MERIDIAN BUILDERS INC", "Meridian Builders, Inc.")).toBe(true);
    expect(same("retainage.release_condition", "Final Completion of the Subcontract Work and Owner's acceptance", "Final Completion of the Subcontract Work")).toBe(true);
    expect(same("retainage.release_condition", "Owner acceptance", "Final Completion of the Subcontract Work")).toBe(false);
    expect(same("retainage.cap_bps", null, null)).toBe(true);
    expect(same("retainage.cap_bps", 500, null)).toBe(false);
  });
});

describe("bootstrap", () => {
  it("is reproducible and brackets the point estimate", () => {
    const good = scoreContract(spec, perfect, pages);
    const x = clone(perfect);
    x.timing.days = { ...x.timing.days, value: 10 };
    const bad = scoreContract(spec, x, pages);
    const rs = [good, good, bad, good];
    const ci = bootstrap(rs, (m) => m.accuracy);
    expect(ci).toEqual(bootstrap(rs, (m) => m.accuracy));
    const point = metrics(rs).accuracy;
    expect(ci![0]).toBeLessThanOrEqual(point);
    expect(ci![1]).toBeGreaterThanOrEqual(point);
  });
});

describe("degenerate runs", () => {
  it("a statistic that is undefined in every resample has no interval, rather than a NaN one", () => {
    const good = scoreContract(spec, perfect, pages);
    // No wrong fields anywhere, so the catch rate is null in every resample.
    expect(bootstrap([good, good, good], (m) => m.layers.L3.catchRate)).toBeNull();
    expect(bootstrap([good], (m) => m.accuracy)).toBeNull();
  });

  it("the quote-verification rate is undefined, not 0%, when no field carries a quote", () => {
    const r = scoreContract(spec, perfect, pages);
    const unquoted = { ...r, fields: r.fields.map((f) => ({ ...f, quoted: false, quoteVerified: false })) };
    expect(metrics([unquoted]).quoteVerifiedRate).toBeNull();
  });

  it("an empty run yields no NaN", () => {
    const m = metrics([]);
    expect(Object.values(m).filter((v) => typeof v === "number").every(Number.isFinite)).toBe(true);
    for (const l of LAYERS) expect(Object.values(m.layers[l]).every((v) => v === null || Number.isFinite(v))).toBe(true);
  });
});
