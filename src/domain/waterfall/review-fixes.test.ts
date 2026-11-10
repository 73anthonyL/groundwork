/** Regression tests for defects found in review of the adjustments work. */
import { describe, expect, it } from "vitest";
import { addDays, planWaterfall, type Candidate, type OwnerPayment, type RetentionCandidate } from "./engine";
import { overlayFor } from "../statutes";

const $ = (d: number) => Math.round(d * 100);
const received = new Date("2026-11-03T18:00:00Z");
const rules = { timingType: "pay_when_paid" as const, timingDays: 7, agreedInWriting: true, retainageBps: 1000, capBps: null };

const candidate = (over: Partial<Candidate> = {}): Candidate => ({
  payAppId: "app",
  contractId: "k",
  contractSumCents: $(400_000),
  isFinal: false,
  approvedOn: "2026-11-01",
  grossCents: $(100_000),
  fundedGrossCents: 0,
  retainageHeldToDateCents: 0,
  offsetCents: 0,
  rules,
  overlay: overlayFor("CA", "2025-11-18"),
  ...over,
});
const cert = (over: Partial<RetentionCandidate> = {}): RetentionCandidate => ({ certificationId: "cert", contractId: "k", amountCents: $(5_000), isFinal: false, releaseDays: 10, offsetCents: 0, overlay: overlayFor("CA", "2025-11-18"), ...over });
const payment = (over: Partial<OwnerPayment> = {}): OwnerPayment => ({ eventId: "e", amountCents: $(100_000), receivedAt: received, periodThrough: "2026-10-31", includesRetention: false, exclusions: [], ...over });

describe("backcharges follow the contract through an event", () => {
  it("a retention-only payment still recovers a backcharge pinned to an unfunded application", () => {
    const plan = planWaterfall(payment({ amountCents: $(5_000), retentionCents: $(5_000), includesRetention: true }), [candidate({ offsetCents: $(2_000) })], [cert()]);
    const r = plan.releases.find((x) => x.kind === "retention")!;
    expect(r).toMatchObject({ offsetCents: $(2_000), releaseCents: $(3_000), retentionReleasedCents: $(5_000) });
  });

  it("what a progress release cannot absorb carries to the retention release, and is never taken twice", () => {
    const plan = planWaterfall(payment({ amountCents: $(6_000), retentionCents: $(5_000), includesRetention: true }), [candidate({ grossCents: $(1_000), offsetCents: $(3_000) })], [cert()]);
    const [progress, retention] = [plan.releases.find((x) => x.kind === "progress")!, plan.releases.find((x) => x.kind === "retention")!];
    // $1,000 gross − $100 retainage leaves $900 to set off; the other $2,100 comes off the retention release.
    expect(progress).toMatchObject({ offsetCents: $(900), releaseCents: 0 });
    expect(retention).toMatchObject({ offsetCents: $(2_100), releaseCents: $(2_900) });
    expect(progress.offsetCents + retention.offsetCents).toBe($(3_000));
  });

  it("a final application can set off against the retainage it pays out", () => {
    const plan = planWaterfall(payment({ amountCents: $(1_000), includesRetention: true }), [candidate({ isFinal: true, grossCents: $(1_000), retainageHeldToDateCents: $(9_000), offsetCents: $(5_000) })]);
    expect(plan.releases[0]).toMatchObject({ offsetCents: $(5_000), retentionReleasedCents: $(9_000), releaseCents: $(5_000) });
  });

  it("an excluded application does not swallow the contract's backcharge", () => {
    const plan = planWaterfall(payment({ exclusions: ["a1"] }), [candidate({ payAppId: "a1", offsetCents: $(4_000) }), candidate({ payAppId: "a2" })]);
    expect(plan.releases).toHaveLength(1);
    expect(plan.releases[0]).toMatchObject({ payAppId: "a2", offsetCents: $(4_000) });
  });
});

describe("statutory ceilings and conditional caps", () => {
  it("a fixed period cannot run past a deadline the contract may not lengthen (Texas)", () => {
    const plan = planWaterfall(payment(), [candidate({ overlay: overlayFor("TX", "2026-02-01"), rules: { ...rules, timingType: "fixed_days", timingDays: 45 } })]);
    expect(plan.releases[0].payByAt).toEqual(addDays(received, 7));
    expect(plan.warnings.map((w) => w.code)).toContain("contract_days_capped_by_statute");
  });

  it("a fixed period that ends sooner than the statute stands, and California lets the contract set it", () => {
    const tx = planWaterfall(payment(), [candidate({ overlay: overlayFor("TX", "2026-02-01"), rules: { ...rules, timingType: "fixed_days", timingDays: 5 } })]);
    expect(tx.releases[0].payByAt).toEqual(new Date("2026-11-06T00:00:00Z"));
    const ca = planWaterfall(payment(), [candidate({ rules: { ...rules, timingType: "fixed_days", timingDays: 45 } })]);
    expect(ca.releases[0].payByAt).toEqual(new Date("2026-12-16T00:00:00Z"));
  });

  it("Illinois steps the cap from 10% to 5% once the work is half billed; North Dakota stops retainage", () => {
    const il = (completeBps: number) => planWaterfall(payment(), [candidate({ overlay: overlayFor("IL", "2026-02-01"), completeBps })]).releases[0].retainageWithheldCents;
    expect(il(4_000)).toBe($(10_000));
    expect(il(5_000)).toBe($(5_000));
    const nd = planWaterfall(payment(), [candidate({ overlay: overlayFor("ND", "2026-02-01"), completeBps: 6_000 })]);
    expect(nd.releases[0].retainageWithheldCents).toBe(0);
  });

  it("Kansas applies its 5% default, not the 10% ceiling", () => {
    expect(overlayFor("KS", "2026-02-01").retentionCapBps).toBe(500);
    expect(planWaterfall(payment(), [candidate({ overlay: overlayFor("KS", "2026-02-01") })]).releases[0].retainageWithheldCents).toBe($(5_000));
  });

  it("says so when owner retention arrives and nothing is certified", () => {
    const plan = planWaterfall(payment({ amountCents: $(50_000), retentionCents: $(50_000), includesRetention: true }), [], []);
    expect(plan.releases).toHaveLength(0);
    expect(plan.warnings.map((w) => w.code)).toContain("retention_received_nothing_certified");
  });
});
