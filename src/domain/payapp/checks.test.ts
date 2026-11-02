import { describe, expect, it } from "vitest";
import { runPayAppChecks, type PayAppContext, type PayAppInput } from "./checks";

const $ = (d: number) => Math.round(d * 100);
const sov = [
  { id: "l1", lineNo: 1, description: "Mobilization", scheduledValueCents: $(10_000) },
  { id: "l2", lineNo: 2, description: "Metal stud framing", scheduledValueCents: $(70_000) },
  { id: "l3", lineNo: 3, description: "Gypsum board — hang", scheduledValueCents: $(60_000) },
];
const ctx: PayAppContext = {
  contractSumCents: $(200_000),
  sov,
  rules: { retainageBps: 1000, storedMaterialsAllowed: false },
  prior: [{ number: 1, periodThrough: "2026-09-30", grossApprovedCents: $(40_000) }],
};

// Summit's Pay App #2: bills retainage at 5% instead of the contract's 10%.
const summit2: PayAppInput = {
  number: 2,
  periodThrough: "2026-10-31",
  isFinal: false,
  lines: [
    { sovLineId: "l2", previouslyCompletedCents: $(30_000), thisPeriodCents: $(40_000), storedCents: 0 },
    { sovLineId: "l3", previouslyCompletedCents: 0, thisPeriodCents: $(10_000), storedCents: 0 },
  ],
  workThisPeriodCents: $(50_000),
  storedMaterialsCents: 0,
  previouslyBilledCents: $(40_000),
  retainageBilledCents: $(2_500),
  netDueBilledCents: $(47_500),
};

describe("pay-app checks", () => {
  it("catches retainage billed at 5% when the rule says 10%, with a one-click correction", () => {
    const r = runPayAppChecks(summit2, ctx);
    const ret = r.checks.find((c) => c.id === "retainage_rate")!;
    expect(ret.status).toBe("fail");
    expect(ret.rulePath).toBe("retainage.percent_bps");
    expect(ret.expectedCents).toBe($(5_000));
    expect(ret.correction).toEqual({ retainageCents: $(5_000), netDueCents: $(45_000) });
    expect(r.checks.filter((c) => c.status === "pass").map((c) => c.id)).toEqual([
      "rules_approved",
      "line_math",
      "sov_overbilling",
      "previously_billed",
      "net_due_math",
      "period_sequence",
      "contract_sum",
    ]);
    expect(r.blocking).toBe(true);
  });

  it("passes a clean application", () => {
    const r = runPayAppChecks({ ...summit2, retainageBilledCents: $(5_000), netDueBilledCents: $(45_000) }, ctx);
    expect(r.checks.every((c) => c.status === "pass")).toBe(true);
    expect(r.blocking).toBe(false);
  });

  it("flags over-billing, history mismatch and sequence errors", () => {
    const bad: PayAppInput = {
      ...summit2,
      number: 4,
      lines: [{ sovLineId: "l1", previouslyCompletedCents: $(10_000), thisPeriodCents: $(50_000), storedCents: 0 }],
      previouslyBilledCents: $(35_000),
      retainageBilledCents: $(5_000),
      netDueBilledCents: $(45_000),
    };
    const ids = runPayAppChecks(bad, ctx)
      .checks.filter((c) => c.status === "fail")
      .map((c) => c.id);
    expect(ids).toEqual(["sov_overbilling", "previously_billed", "period_sequence"]);
  });

  it("blocks when no rules are approved and accepts billed retainage as stated", () => {
    const r = runPayAppChecks(summit2, { ...ctx, rules: null });
    expect(r.checks.find((c) => c.id === "rules_approved")?.status).toBe("fail");
    expect(r.checks.find((c) => c.id === "retainage_rate")?.status).toBe("warn");
  });

  it("final applications withhold no retainage", () => {
    const r = runPayAppChecks({ ...summit2, isFinal: true, retainageBilledCents: 0, netDueBilledCents: $(50_000) }, ctx);
    expect(r.checks.find((c) => c.id === "retainage_rate")?.status).toBe("pass");
  });
});
