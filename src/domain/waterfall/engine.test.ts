import { describe, expect, it } from "vitest";
import { addDays, allocateProRata, planWaterfall, type Candidate, type OwnerPayment } from "./engine";
import { overlayFor } from "../statutes";

const $ = (d: number) => Math.round(d * 100);
const received = new Date("2026-11-03T18:00:00Z");

function candidate(over: Partial<Candidate> & { payAppId: string; contractId: string }): Candidate {
  return {
    contractSumCents: $(400_000),
    isFinal: false,
    approvedOn: "2026-11-01",
    grossCents: $(100_000),
    fundedGrossCents: 0,
    retainageHeldToDateCents: 0,
    offsetCents: 0,
    rules: { timingType: "pay_when_paid", timingDays: 7, agreedInWriting: true, retainageBps: 1000, capBps: null },
    overlay: overlayFor("CA", "2025-11-18"),
    ...over,
  };
}

function payment(over: Partial<OwnerPayment> = {}): OwnerPayment {
  return {
    eventId: "evt-1",
    amountCents: $(200_000),
    receivedAt: received,
    periodThrough: "2026-09-30",
    includesRetention: false,
    exclusions: [],
    ...over,
  };
}

// The Bayview Clinic TI seed: Ironline 10% / Pacific 5% / Summit 10% pay-if-paid.
const seedApps = () => [
  candidate({ payAppId: "iron-1", contractId: "iron", grossCents: $(100_000) }),
  candidate({
    payAppId: "pac-1",
    contractId: "pac",
    contractSumCents: $(300_000),
    grossCents: $(60_000),
    rules: { timingType: "pay_when_paid", timingDays: 7, agreedInWriting: true, retainageBps: 500, capBps: null },
  }),
  candidate({
    payAppId: "sum-1",
    contractId: "sum",
    contractSumCents: $(200_000),
    grossCents: $(40_000),
    rules: { timingType: "pay_if_paid", timingDays: 7, agreedInWriting: true, retainageBps: 1000, capBps: null },
  }),
];

describe("allocateProRata", () => {
  it("funds everything when the amount covers it", () => {
    expect(allocateProRata(100, [30, 70])).toEqual([30, 70]);
  });
  it("never creates or loses cents under largest-remainder rounding", () => {
    const out = allocateProRata(10_000, [30_000, 30_000, 30_000]);
    expect(out).toEqual([3334, 3333, 3333]);
    expect(out.reduce((a, b) => a + b)).toBe(10_000);
    for (let amt = 1; amt < 500; amt += 7) {
      const w = [1234, 5, 99_999, 7_777];
      const r = allocateProRata(amt, w);
      expect(r.reduce((a, b) => a + b)).toBe(amt);
      r.forEach((v, i) => expect(v).toBeLessThanOrEqual(w[i]));
    }
  });
});

describe("planWaterfall — seed scenario", () => {
  it("Owner Payment #1 ($200,000, full) funds every application in full", () => {
    const plan = planWaterfall(payment(), seedApps());
    const by = Object.fromEntries(plan.releases.map((r) => [r.payAppId, r]));
    expect(by["iron-1"]).toMatchObject({ grossCents: $(100_000), retainageWithheldCents: $(10_000), releaseCents: $(90_000), awaitingOwnerCents: 0 });
    expect(by["pac-1"]).toMatchObject({ grossCents: $(60_000), retainageWithheldCents: $(3_000), releaseCents: $(57_000) });
    expect(by["sum-1"]).toMatchObject({ grossCents: $(40_000), retainageWithheldCents: $(4_000), releaseCents: $(36_000) });
    const paid = plan.releases.reduce((s, r) => s + r.releaseCents, 0);
    const held = plan.releases.reduce((s, r) => s + r.retainageWithheldCents, 0);
    expect(paid).toBe($(183_000));
    expect(held).toBe($(17_000));
    expect(paid + held).toBe($(200_000));
    expect(plan.unallocatedCents).toBe(0);
    expect(plan.unfunded).toEqual([]);
  });

  it("Owner Payment #2 ($125,000 of $250,000) funds 50% pro-rata by gross", () => {
    const apps = [
      candidate({ payAppId: "iron-2", contractId: "iron", grossCents: $(100_000), retainageHeldToDateCents: $(10_000) }),
      candidate({
        payAppId: "pac-2",
        contractId: "pac",
        contractSumCents: $(300_000),
        grossCents: $(100_000),
        retainageHeldToDateCents: $(3_000),
        rules: { timingType: "pay_when_paid", timingDays: 7, agreedInWriting: true, retainageBps: 500, capBps: null },
      }),
      candidate({
        payAppId: "sum-2",
        contractId: "sum",
        contractSumCents: $(200_000),
        grossCents: $(50_000),
        retainageHeldToDateCents: $(4_000),
        rules: { timingType: "pay_if_paid", timingDays: 7, agreedInWriting: true, retainageBps: 1000, capBps: null },
      }),
    ];
    const plan = planWaterfall(payment({ amountCents: $(125_000), periodThrough: "2026-10-31" }), apps);
    const by = Object.fromEntries(plan.releases.map((r) => [r.payAppId, r]));
    expect(by["iron-2"]).toMatchObject({ grossCents: $(50_000), retainageWithheldCents: $(5_000), releaseCents: $(45_000), awaitingOwnerCents: $(50_000) });
    expect(by["pac-2"]).toMatchObject({ grossCents: $(50_000), retainageWithheldCents: $(2_500), releaseCents: $(47_500), awaitingOwnerCents: $(50_000) });
    expect(by["sum-2"]).toMatchObject({ grossCents: $(25_000), retainageWithheldCents: $(2_500), releaseCents: $(22_500), awaitingOwnerCents: $(25_000) });
    expect(plan.releases.reduce((s, r) => s + r.releaseCents + r.retainageWithheldCents, 0)).toBe($(125_000));
    expect(plan.warnings.some((w) => w.code === "partial_funding")).toBe(true);
  });

  it("starts the 7-day §7108.5 clock from receipt, and flags Summit's pay-if-paid as void", () => {
    const plan = planWaterfall(payment(), seedApps());
    for (const r of plan.releases) expect(r.payByAt).toEqual(addDays(received, 7));
    const w = plan.warnings.find((w) => w.code === "pay_if_paid_void_in_state");
    expect(w?.payAppId).toBe("sum-1");
    expect(w?.statutes).toContain("CA_CLARKE_V_SAFECO");
    const sum = plan.releases.find((r) => r.payAppId === "sum-1")!;
    expect(sum.basis.statutes).toContain("CA_CLARKE_V_SAFECO");
    expect(sum.waiverForm).toBe("cp_8132");
  });
});

describe("planWaterfall — edge cases", () => {
  it("splits odd cents without creating or losing any", () => {
    const apps = ["a", "b", "c"].map((id) => candidate({ payAppId: id, contractId: id, grossCents: 30_000 }));
    const plan = planWaterfall(payment({ amountCents: 10_000 }), apps);
    expect(plan.releases.map((r) => r.grossCents)).toEqual([3334, 3333, 3333]);
    expect(plan.releases.reduce((s, r) => s + r.releaseCents + r.retainageWithheldCents, 0)).toBe(10_000);
  });

  it("stops withholding when the contractual retainage cap is reached", () => {
    const c = candidate({
      payAppId: "x",
      contractId: "x",
      retainageHeldToDateCents: $(18_000),
      rules: { timingType: "pay_when_paid", timingDays: 7, agreedInWriting: true, retainageBps: 1000, capBps: 500 },
    });
    const plan = planWaterfall(payment({ amountCents: $(100_000) }), [c]);
    expect(plan.releases[0].retainageWithheldCents).toBe($(2_000));
    expect(plan.releases[0].releaseCents).toBe($(98_000));
    expect(plan.warnings.some((w) => w.code === "retainage_cap_reached")).toBe(true);
  });

  it("clamps a 10% contract to the 5% statutory cap for CA contracts executed in 2026", () => {
    const c = candidate({ payAppId: "x", contractId: "x", overlay: overlayFor("CA", "2026-02-01") });
    const plan = planWaterfall(payment({ amountCents: $(100_000) }), [c]);
    expect(plan.releases[0].retainageWithheldCents).toBe($(5_000));
    const w = plan.warnings.find((w) => w.code === "retainage_clamped_by_statute");
    expect(w?.statutes).toEqual(["CA_CIV_8811"]);
    expect(plan.releases[0].basis.statutes).toContain("CA_CIV_8811");
  });

  it("honors a longer period agreed in writing (10 days beats the 7-day default) and says so", () => {
    const c = candidate({
      payAppId: "x",
      contractId: "x",
      rules: { timingType: "pay_when_paid", timingDays: 10, agreedInWriting: true, retainageBps: 500, capBps: null },
    });
    const plan = planWaterfall(payment({ amountCents: $(100_000) }), [c]);
    expect(plan.releases[0].payByAt).toEqual(addDays(received, 10));
    expect(plan.warnings.some((w) => w.code === "contract_days_override_default")).toBe(true);
  });

  it("applies the statutory default when the contract is silent", () => {
    const c = candidate({
      payAppId: "x",
      contractId: "x",
      rules: { timingType: "silent", timingDays: null, agreedInWriting: null, retainageBps: 1000, capBps: null },
    });
    const plan = planWaterfall(payment({ amountCents: $(100_000) }), [c]);
    expect(plan.releases[0].payByAt).toEqual(addDays(received, 7));
    expect(plan.warnings.some((w) => w.code === "timing_silent_default")).toBe(true);
  });

  it("for a state with no researched record, uses contract days or no deadline, and warns", () => {
    const rules = { timingType: "pay_when_paid" as const, timingDays: 30, agreedInWriting: true, retainageBps: 1000, capBps: null };
    const known = candidate({ payAppId: "zz", contractId: "zz", overlay: overlayFor("ZZ", "2026-02-01"), rules });
    const silent = candidate({ payAppId: "zz2", contractId: "zz2", overlay: overlayFor("ZZ", "2026-02-01"), rules: { ...rules, timingType: "silent", timingDays: null, agreedInWriting: null } });
    const plan = planWaterfall(payment({ amountCents: $(200_000) }), [known, silent]);
    expect(plan.releases[0].payByAt).toEqual(addDays(received, 30));
    expect(plan.releases[1].payByAt).toBeNull();
    expect(plan.releases[0].retainageWithheldCents).toBe($(10_000));
    expect(plan.warnings.filter((w) => w.code === "no_statute_loaded").length).toBe(2);
  });
});

describe("planWaterfall — other states", () => {
  const rules = { timingType: "pay_when_paid" as const, timingDays: 30, agreedInWriting: true, retainageBps: 1000, capBps: null };
  const one = (state: string, over: Partial<Candidate> = {}, executedOn = "2026-02-01", prime?: number) =>
    planWaterfall(payment({ amountCents: $(100_000) }), [candidate({ payAppId: state, contractId: state, overlay: overlayFor(state, executedOn, { primeContractSumCents: prime }), rules, ...over })]);

  it("Texas: the 7-day rule cannot be lengthened by contract, and there is no private retainage cap", () => {
    const plan = one("TX");
    expect(plan.releases[0].payByAt).toEqual(addDays(received, 7));
    expect(plan.releases[0].retainageWithheldCents).toBe($(10_000));
    expect(plan.warnings.map((w) => w.code)).toContain("contract_days_capped_by_statute");
    expect(plan.releases[0].basis.statutes).toContain("TX_PROMPT_PAY");
  });

  it("Texas: pay-if-paid is honored but flagged, because the statute limits it", () => {
    const plan = one("TX", { rules: { ...rules, timingType: "pay_if_paid" } });
    expect(plan.warnings.map((w) => w.code)).toContain("pay_if_paid_uncertain");
  });

  it("New York: pay-if-paid is void, and the 5% cap applies only to prime contracts of $150,000 or more", () => {
    const big = one("NY", { rules: { ...rules, timingType: "pay_if_paid" } }, "2024-06-01", $(4_000_000));
    expect(big.releases[0].retainageWithheldCents).toBe($(5_000));
    expect(big.warnings.map((w) => w.code)).toEqual(expect.arrayContaining(["retainage_clamped_by_statute", "pay_if_paid_void_in_state"]));
    expect(one("NY", {}, "2024-06-01", $(120_000)).releases[0].retainageWithheldCents).toBe($(10_000));
    // Contracts entered before the cap took effect keep their rate.
    expect(one("NY", {}, "2023-01-15", $(4_000_000)).releases[0].retainageWithheldCents).toBe($(10_000));
  });

  it("New Mexico: retainage is prohibited, so nothing is withheld", () => {
    const plan = one("NM");
    expect(plan.releases[0].retainageWithheldCents).toBe(0);
    expect(plan.releases[0].releaseCents).toBe($(100_000));
  });

  it("Kentucky: the statutory period runs in business days", () => {
    // Received Tue 2026-11-03; 15 business days later is Tue 2026-11-24.
    const plan = one("KY", { rules: { ...rules, timingType: "silent", timingDays: null, agreedInWriting: null } });
    expect(plan.releases[0].payByAt).toEqual(new Date("2026-11-24T18:00:00Z"));
  });

  it("Washington: no private prompt-pay deadline, so the contract's days apply, but retainage is capped at 5%", () => {
    const plan = one("WA");
    expect(plan.releases[0].payByAt).toEqual(addDays(received, 30));
    expect(plan.releases[0].retainageWithheldCents).toBe($(5_000));
    expect(plan.warnings.map((w) => w.code)).toContain("no_prompt_pay_statute");
  });
});

describe("planWaterfall — remaining edge cases", () => {
  it("skips applications already fully funded and leaves overpayment unallocated", () => {
    const done = candidate({ payAppId: "done", contractId: "d", grossCents: $(50_000), fundedGrossCents: $(50_000) });
    const open = candidate({ payAppId: "open", contractId: "o", grossCents: $(50_000) });
    const plan = planWaterfall(payment({ amountCents: $(80_000) }), [done, open]);
    expect(plan.releases.map((r) => r.payAppId)).toEqual(["open"]);
    expect(plan.unallocatedCents).toBe($(30_000));
    expect(plan.warnings.some((w) => w.code === "overpayment")).toBe(true);
  });

  it("honors contractor exclusions", () => {
    const plan = planWaterfall(payment({ amountCents: $(100_000), exclusions: ["pac-1", "sum-1"] }), seedApps());
    expect(plan.releases.map((r) => r.payAppId)).toEqual(["iron-1"]);
    expect(plan.releases[0].releaseCents).toBe($(90_000));
  });

  it("applies pinned offsets after retainage, never below zero", () => {
    const c = candidate({ payAppId: "x", contractId: "x", grossCents: $(10_000), offsetCents: $(9_500) });
    const plan = planWaterfall(payment({ amountCents: $(10_000) }), [c]);
    expect(plan.releases[0]).toMatchObject({ retainageWithheldCents: $(1_000), offsetCents: $(9_000), releaseCents: 0 });
  });

  it("final application: no new retainage, releases what is held, uses the final waiver and the 10-day clock", () => {
    const c = candidate({ payAppId: "fin", contractId: "x", isFinal: true, grossCents: $(20_000), retainageHeldToDateCents: $(38_000) });
    const plan = planWaterfall(payment({ amountCents: $(20_000), includesRetention: true }), [c]);
    const r = plan.releases[0];
    expect(r.retainageWithheldCents).toBe(0);
    expect(r.retentionReleasedCents).toBe($(38_000));
    expect(r.releaseCents).toBe($(58_000));
    expect(r.waiverForm).toBe("cf_8136");
    expect(r.retentionByAt).toEqual(addDays(received, 10));
    expect(r.basis.statutes).toContain("CA_CIV_8814");
  });

  it("final application without retention keeps retainage held", () => {
    const c = candidate({ payAppId: "fin", contractId: "x", isFinal: true, grossCents: $(20_000), retainageHeldToDateCents: $(38_000) });
    const plan = planWaterfall(payment({ amountCents: $(20_000), includesRetention: false }), [c]);
    expect(plan.releases[0].retentionReleasedCents).toBe(0);
    expect(plan.releases[0].releaseCents).toBe($(20_000));
  });

  it("is deterministic: same inputs, same plan", () => {
    const a = JSON.stringify(planWaterfall(payment(), seedApps()));
    const b = JSON.stringify(planWaterfall(payment(), seedApps()));
    expect(a).toBe(b);
  });
});
