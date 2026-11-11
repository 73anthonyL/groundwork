/** A pay application can never bill a schedule-of-values line past its scheduled value, however the lines are presented. */
import { describe, expect, it } from "vitest";
import { runPayAppChecks, type PayAppContext, type PayAppInput } from "./checks";

const sov = [
  { id: "l1", lineNo: 1, description: "Mobilization", scheduledValueCents: 1_000_000 },
  { id: "l2", lineNo: 2, description: "Framing", scheduledValueCents: 7_000_000 },
];
const ctx: PayAppContext = { contractSumCents: 8_000_000, sov, rules: { retainageBps: 1000, storedMaterialsAllowed: true }, prior: [] };

function app(lines: PayAppInput["lines"], over: Partial<PayAppInput> = {}): PayAppInput {
  const work = lines.reduce((s, l) => s + l.thisPeriodCents, 0);
  const stored = lines.reduce((s, l) => s + l.storedCents, 0);
  const retainage = Math.round(((work + stored) * 1000) / 10_000);
  return { number: 1, periodThrough: "2026-09-30", isFinal: false, lines, workThisPeriodCents: work, storedMaterialsCents: stored, previouslyBilledCents: 0, retainageBilledCents: retainage, netDueBilledCents: work + stored - retainage, ...over };
}
const status = (a: PayAppInput, id: string, c: PayAppContext = ctx) => runPayAppChecks(a, c).checks.find((x) => x.id === id)!.status;

describe("schedule-of-values over-billing", () => {
  it("passes at exactly the scheduled value and fails one cent past it", () => {
    expect(status(app([{ sovLineId: "l1", previouslyCompletedCents: 400_000, thisPeriodCents: 600_000, storedCents: 0 }]), "sov_overbilling")).toBe("pass");
    expect(status(app([{ sovLineId: "l1", previouslyCompletedCents: 400_000, thisPeriodCents: 600_001, storedCents: 0 }]), "sov_overbilling")).toBe("fail");
  });

  it("counts stored materials against the line", () => {
    expect(status(app([{ sovLineId: "l1", previouslyCompletedCents: 0, thisPeriodCents: 600_000, storedCents: 400_001 }]), "sov_overbilling")).toBe("fail");
  });

  it("adds up a line that appears twice on one application", () => {
    const twice = app([
      { sovLineId: "l1", previouslyCompletedCents: 0, thisPeriodCents: 600_000, storedCents: 0 },
      { sovLineId: "l1", previouslyCompletedCents: 0, thisPeriodCents: 600_000, storedCents: 0 },
    ]);
    const r = runPayAppChecks(twice, ctx);
    expect(r.checks.find((c) => c.id === "sov_overbilling")).toMatchObject({ status: "fail", detail: "Line 1 (Mobilization) totals 1200000 of 1000000 cents." });
    expect(r.blocking).toBe(true);
  });

  it("fails a line that is not on this contract's schedule of values", () => {
    const r = runPayAppChecks(app([{ sovLineId: "someone-elses-line", previouslyCompletedCents: 0, thisPeriodCents: 100, storedCents: 0 }]), ctx);
    expect(r.checks.find((c) => c.id === "sov_overbilling")?.status).toBe("fail");
    expect(r.blocking).toBe(true);
  });

  it("fails a negative amount on a line, which would otherwise hide over-billing on another", () => {
    const netted = app([
      { sovLineId: "l1", previouslyCompletedCents: 0, thisPeriodCents: 1_000_000, storedCents: 0 },
      { sovLineId: "l2", previouslyCompletedCents: 0, thisPeriodCents: -500_000, storedCents: 0 },
    ]);
    expect(status(netted, "line_math")).toBe("fail");
  });

  it("holds over many generated applications: a passing check means no line exceeds its value", () => {
    let seed = 42;
    const rnd = (n: number) => (seed = (seed * 1_103_515_245 + 12_345) & 0x7fffffff) % n;
    for (let t = 0; t < 2_000; t++) {
      const lines = Array.from({ length: 1 + rnd(4) }, () => ({ sovLineId: rnd(2) ? "l1" : "l2", previouslyCompletedCents: rnd(4_000_000), thisPeriodCents: rnd(4_000_000), storedCents: rnd(1_000_000) }));
      const passed = status(app(lines), "sov_overbilling") === "pass";
      const totals = new Map<string, number>();
      const prev = new Map<string, number>();
      for (const l of lines) {
        totals.set(l.sovLineId, (totals.get(l.sovLineId) ?? 0) + l.thisPeriodCents + l.storedCents);
        prev.set(l.sovLineId, Math.max(prev.get(l.sovLineId) ?? 0, l.previouslyCompletedCents));
      }
      const within = [...totals].every(([id, v]) => v + prev.get(id)! <= sov.find((s) => s.id === id)!.scheduledValueCents);
      expect(passed, `case ${t}`).toBe(within);
    }
  });
});

describe("other pay-app arithmetic", () => {
  it("total billed to date cannot pass the subcontract sum, to the cent", () => {
    const prior = [{ number: 1, periodThrough: "2026-08-31", grossApprovedCents: 7_000_000 }];
    const line = (cents: number) => app([{ sovLineId: "l1", previouslyCompletedCents: 0, thisPeriodCents: cents, storedCents: 0 }], { number: 2, previouslyBilledCents: 7_000_000 });
    expect(status(line(1_000_000), "contract_sum", { ...ctx, prior })).toBe("pass");
    expect(status(line(1_000_001), "contract_sum", { ...ctx, prior, sov: [{ ...sov[0], scheduledValueCents: 2_000_000 }] })).toBe("fail");
  });

  it("the expected retainage is the contract rate on this period's gross, rounded to the cent", () => {
    for (const gross of [1, 3, 5, 15, 333, 99_999, 1_000_001]) {
      const r = runPayAppChecks(app([{ sovLineId: "l2", previouslyCompletedCents: 0, thisPeriodCents: gross, storedCents: 0 }]), { ...ctx, rules: { retainageBps: 750, storedMaterialsAllowed: true } });
      expect(r.expectedRetainageCents).toBe(Math.round((gross * 750) / 10_000));
      expect(r.expectedRetainageCents + r.expectedNetDueCents).toBe(gross);
    }
  });

  it("an application numbered out of order or dated on or before the last period fails the sequence check", () => {
    const prior = [{ number: 1, periodThrough: "2026-09-30", grossApprovedCents: 100 }];
    const a = (over: Partial<PayAppInput>) => app([{ sovLineId: "l2", previouslyCompletedCents: 100, thisPeriodCents: 100, storedCents: 0 }], { previouslyBilledCents: 100, ...over });
    expect(status(a({ number: 2, periodThrough: "2026-10-31" }), "period_sequence", { ...ctx, prior })).toBe("pass");
    expect(status(a({ number: 2, periodThrough: "2026-09-30" }), "period_sequence", { ...ctx, prior })).toBe("fail");
    expect(status(a({ number: 3, periodThrough: "2026-10-31" }), "period_sequence", { ...ctx, prior })).toBe("fail");
    expect(status(a({ number: 0, periodThrough: "2026-10-31" }), "period_sequence", ctx)).toBe("fail");
  });
});
