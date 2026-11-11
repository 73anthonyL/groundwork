/** Invariants of the allocator and the planner, checked over many generated scenarios. Deterministic: the generator is seeded. */
import { describe, expect, it } from "vitest";
import { addBusinessDays, addDays, allocateProRata, planWaterfall, type Candidate, type OwnerPayment, type RetentionCandidate } from "./engine";
import { STATES, overlayFor } from "../statutes";

/** Small seeded generator (mulberry32), so a failure reproduces. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const int = (r: () => number, lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

const received = new Date("2026-11-03T18:00:00Z");
const payment = (over: Partial<OwnerPayment> = {}): OwnerPayment => ({ eventId: "e", amountCents: 0, receivedAt: received, periodThrough: "2026-10-31", includesRetention: false, exclusions: [], ...over });
const candidate = (over: Partial<Candidate> = {}): Candidate => ({
  payAppId: "app",
  contractId: "k",
  contractSumCents: 40_000_000,
  isFinal: false,
  approvedOn: "2026-11-01",
  grossCents: 10_000_000,
  fundedGrossCents: 0,
  retainageHeldToDateCents: 0,
  offsetCents: 0,
  rules: { timingType: "pay_when_paid", timingDays: 7, agreedInWriting: true, retainageBps: 1000, capBps: null },
  overlay: overlayFor("CA", "2025-11-18"),
  ...over,
});

describe("allocateProRata invariants", () => {
  it("conserves every cent, stays within each weight, and is within one cent of the exact share", () => {
    const r = rng(20261110);
    for (let t = 0; t < 4_000; t++) {
      const scale = [10, 1_000, 1_000_000, 100_000_000, 5_000_000_000][int(r, 0, 4)];
      const weights = Array.from({ length: int(r, 1, 6) }, () => int(r, 0, scale));
      const total = sum(weights);
      const amount = int(r, 0, Math.max(1, total + 5));
      const out = allocateProRata(amount, weights);
      expect(sum(out), `amount ${amount} over ${weights}`).toBe(Math.min(amount, total));
      out.forEach((v, i) => {
        expect(Number.isInteger(v)).toBe(true);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(weights[i]);
        if (amount < total) {
          // Exact share in integer arithmetic, so the reference itself cannot round.
          const floor = Number((BigInt(amount) * BigInt(weights[i])) / BigInt(total));
          expect(v - floor === 0 || v - floor === 1, `share ${v} vs exact floor ${floor}`).toBe(true);
        }
      });
    }
  });

  it("splits amounts that do not divide evenly without favouring anyone by more than a cent", () => {
    for (const amount of [1, 2, 3, 7, 99, 100, 101, 33_333, 99_999, 100_001]) {
      const out = allocateProRata(amount, [1_000_000, 1_000_000, 1_000_000]);
      expect(sum(out)).toBe(amount);
      expect(Math.max(...out) - Math.min(...out)).toBeLessThanOrEqual(1);
    }
  });

  it("gives nothing for a zero or negative amount, or when nothing is outstanding", () => {
    expect(allocateProRata(0, [5, 5])).toEqual([0, 0]);
    expect(allocateProRata(-100, [5, 5])).toEqual([0, 0]);
    expect(allocateProRata(100, [0, 0])).toEqual([0, 0]);
    expect(allocateProRata(100, [])).toEqual([]);
  });

  it("gives a zero-weight claimant nothing even when cents are left over", () => {
    for (let amount = 1; amount < 200; amount++) {
      const out = allocateProRata(amount, [0, 101, 0, 199]);
      expect(out[0]).toBe(0);
      expect(out[2]).toBe(0);
      expect(sum(out)).toBe(amount);
    }
  });
});

describe("planWaterfall invariants", () => {
  const states = STATES.map((s) => s.state);

  it("every cent received is funded or left unallocated, and no release is negative or over-released", () => {
    const r = rng(7108);
    for (let t = 0; t < 1_500; t++) {
      const contracts = int(r, 1, 4);
      const candidates: Candidate[] = [];
      const pinned = new Map<string, number>();
      for (let k = 0; k < contracts; k++) {
        const state = states[int(r, 0, states.length - 1)];
        const sumCents = int(r, 1_000_00, 900_000_00);
        const gross = int(r, 1, sumCents);
        const isFinal = r() < 0.15;
        const offset = r() < 0.3 ? int(r, 1, gross * 2) : 0;
        pinned.set(`k${k}`, offset);
        candidates.push(
          candidate({
            payAppId: `a${k}`,
            contractId: `k${k}`,
            contractSumCents: sumCents,
            grossCents: gross,
            fundedGrossCents: r() < 0.3 ? int(r, 0, gross) : 0,
            retainageHeldToDateCents: int(r, 0, Math.round(sumCents / 10)),
            isFinal,
            offsetCents: offset,
            completeBps: int(r, 0, 10_000),
            rules: {
              timingType: (["pay_when_paid", "pay_if_paid", "fixed_days", "silent"] as const)[int(r, 0, 3)],
              timingDays: r() < 0.2 ? null : int(r, 0, 60),
              agreedInWriting: r() < 0.5,
              retainageBps: r() < 0.1 ? null : int(r, 0, 2_000),
              capBps: r() < 0.2 ? int(r, 0, 1_000) : null,
            },
            overlay: overlayFor(state, r() < 0.5 ? "2025-06-01" : "2026-06-01", { primeContractSumCents: int(r, 50_000_00, 5_000_000_00) }),
          }),
        );
      }
      const outstanding = sum(candidates.map((c) => Math.max(0, c.grossCents - c.fundedGrossCents)));
      const amount = int(r, 1, Math.max(2, Math.round(outstanding * 1.2)));
      const includesRetention = r() < 0.3;
      const retentionCents = includesRetention && r() < 0.5 ? int(r, 0, amount) : 0;
      const plan = planWaterfall(payment({ amountCents: amount, includesRetention, retentionCents }), candidates);

      const progress = plan.releases.filter((x) => x.kind === "progress");
      expect(sum(progress.map((x) => x.grossCents)) + plan.unallocatedCents, `scenario ${t}`).toBe(amount - retentionCents);
      expect(plan.unallocatedCents).toBeGreaterThanOrEqual(0);
      for (const rel of plan.releases) {
        const c = candidates.find((x) => x.payAppId === rel.payAppId)!;
        expect(rel.grossCents).toBeGreaterThan(0);
        expect(rel.grossCents + rel.awaitingOwnerCents).toBe(c.grossCents - c.fundedGrossCents);
        expect(rel.awaitingOwnerCents).toBeGreaterThanOrEqual(0);
        expect(rel.retainageWithheldCents).toBeGreaterThanOrEqual(0);
        expect(rel.retainageWithheldCents).toBeLessThanOrEqual(rel.grossCents);
        expect(rel.offsetCents).toBeGreaterThanOrEqual(0);
        expect(rel.offsetCents).toBeLessThanOrEqual(pinned.get(rel.contractId) ?? 0);
        expect(rel.releaseCents).toBeGreaterThanOrEqual(0);
        expect(rel.releaseCents).toBe(rel.grossCents - rel.retainageWithheldCents - rel.offsetCents + rel.retentionReleasedCents);
        // The explanation adds up to the release.
        const signed = rel.basis.math.filter((m) => m.label !== "release to subcontractor" && m.label !== "awaiting owner");
        expect(sum(signed.map((m) => m.cents))).toBe(rel.releaseCents);
        // Retainage never exceeds what state law allows on this payment.
        const cap = c.overlay.retentionCapAfterHalfBps != null && (c.completeBps ?? 0) >= 5_000 ? c.overlay.retentionCapAfterHalfBps : c.overlay.retentionCapBps;
        if (cap !== null) expect(rel.retainageWithheldCents, `${c.overlay.state} cap ${cap}`).toBeLessThanOrEqual(Math.round((rel.grossCents * cap) / 10_000));
        // Nor the contract's own rate, nor the contract's cap on the total held.
        expect(rel.retainageWithheldCents).toBeLessThanOrEqual(Math.round((rel.grossCents * (c.rules.retainageBps ?? 0)) / 10_000));
        if (c.rules.capBps !== null && rel.retainageWithheldCents > 0) {
          expect(c.retainageHeldToDateCents + rel.retainageWithheldCents).toBeLessThanOrEqual(Math.round((c.contractSumCents * c.rules.capBps) / 10_000));
        }
        if (c.isFinal) expect(rel.retainageWithheldCents).toBe(0);
        if (!c.isFinal || !includesRetention) expect(rel.retentionReleasedCents).toBe(0);
      }
      for (const u of plan.unfunded) expect(u.remainingCents).toBeGreaterThan(0);
    }
  });

  it("two payments that together cover an application fund exactly its gross, no more", () => {
    const r = rng(8814);
    for (let t = 0; t < 300; t++) {
      const gross = [int(r, 1, 50_000_00), int(r, 1, 50_000_00), int(r, 1, 50_000_00)];
      const total = sum(gross);
      const first = int(r, 1, total - 1);
      const apps = gross.map((g, i) => candidate({ payAppId: `a${i}`, contractId: `k${i}`, grossCents: g }));
      const p1 = planWaterfall(payment({ amountCents: first }), apps);
      const funded = new Map(p1.releases.map((x) => [x.payAppId, x.grossCents]));
      const p2 = planWaterfall(payment({ amountCents: total - first }), apps.map((a) => ({ ...a, fundedGrossCents: funded.get(a.payAppId) ?? 0 })));
      expect(p2.unallocatedCents).toBe(0);
      apps.forEach((a, i) => {
        const second = p2.releases.find((x) => x.payAppId === a.payAppId)?.grossCents ?? 0;
        expect((funded.get(a.payAppId) ?? 0) + second).toBe(gross[i]);
      });
    }
  });

  it("a backcharge is never recovered twice across one contract's releases in an event", () => {
    const cert: RetentionCandidate = { certificationId: "c", contractId: "k", amountCents: 300_00, isFinal: false, releaseDays: 10, offsetCents: 0, overlay: overlayFor("CA", "2025-11-18") };
    for (const owed of [1, 500_00, 950_00, 1_500_00, 9_999_99]) {
      const plan = planWaterfall(
        payment({ amountCents: 2_000_00, includesRetention: true }),
        [candidate({ payAppId: "a1", grossCents: 1_000_00, offsetCents: owed }), candidate({ payAppId: "a2", grossCents: 1_000_00 })],
        [cert],
      );
      const taken = sum(plan.releases.map((x) => x.offsetCents));
      const room = 900_00 + 900_00 + 300_00;
      expect(taken).toBe(Math.min(owed, room));
      for (const rel of plan.releases) expect(rel.releaseCents).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("deadlines", () => {
  const nonOverridable = STATES.filter((s) => s.promptPay.days !== null && s.promptPay.contractCanOverride === false);

  it("where the statute cannot be lengthened by contract, a longer contract period never produces a later deadline", () => {
    expect(nonOverridable.length).toBeGreaterThan(0);
    for (const s of nonOverridable) {
      const overlay = overlayFor(s.state, "2026-06-01");
      const statutory = overlay.dayType === "business" ? addBusinessDays(received, s.promptPay.days!) : addDays(received, s.promptPay.days!);
      for (const timingType of ["pay_when_paid", "pay_if_paid", "silent"] as const) {
        const plan = planWaterfall(payment({ amountCents: 1_000_00 }), [candidate({ grossCents: 1_000_00, overlay, rules: { timingType, timingDays: 90, agreedInWriting: true, retainageBps: 0, capBps: null } })]);
        expect(plan.releases[0].payByAt, `${s.state} ${timingType}`).toEqual(statutory);
        expect(plan.warnings.map((w) => w.code)).toContain("contract_days_capped_by_statute");
      }
      const fixed = planWaterfall(payment({ amountCents: 1_000_00 }), [candidate({ grossCents: 1_000_00, approvedOn: "2026-11-01", overlay, rules: { timingType: "fixed_days", timingDays: 90, agreedInWriting: true, retainageBps: 0, capBps: null } })]);
      expect(fixed.releases[0].payByAt, `${s.state} fixed`).toEqual(statutory);
    }
  });

  it("a shorter contract period is kept: the statute is a ceiling, not a floor", () => {
    for (const s of nonOverridable) {
      const overlay = overlayFor(s.state, "2026-06-01");
      const plan = planWaterfall(payment({ amountCents: 1_000_00 }), [candidate({ grossCents: 1_000_00, overlay, rules: { timingType: "pay_when_paid", timingDays: 1, agreedInWriting: true, retainageBps: 0, capBps: null } })]);
      expect(plan.releases[0].payByAt, s.state).toEqual(addDays(received, 1));
    }
  });

  it("the statutory default applies when a period was not agreed in writing, in every state that has one", () => {
    for (const s of STATES.filter((x) => x.promptPay.days !== null)) {
      const overlay = overlayFor(s.state, "2026-06-01");
      const plan = planWaterfall(payment({ amountCents: 1_000_00 }), [candidate({ grossCents: 1_000_00, overlay, rules: { timingType: "pay_when_paid", timingDays: 45, agreedInWriting: false, retainageBps: 0, capBps: null } })]);
      const statutory = overlay.dayType === "business" ? addBusinessDays(received, s.promptPay.days!) : addDays(received, s.promptPay.days!);
      expect(plan.releases[0].payByAt, s.state).toEqual(statutory);
    }
  });

  it("business days skip weekends and never land on one", () => {
    // 2026-11-06 is a Friday.
    const friday = new Date("2026-11-06T18:00:00Z");
    expect(addBusinessDays(friday, 1).toISOString()).toBe("2026-11-09T18:00:00.000Z");
    expect(addBusinessDays(friday, 5).toISOString()).toBe("2026-11-13T18:00:00.000Z");
    expect(addBusinessDays(friday, 0)).toEqual(friday);
    for (let start = 0; start < 14; start++) {
      for (let n = 1; n <= 12; n++) {
        const due = addBusinessDays(addDays(friday, start), n);
        expect([0, 6]).not.toContain(due.getUTCDay());
        expect(due.getTime()).toBeGreaterThanOrEqual(addDays(addDays(friday, start), n).getTime());
      }
    }
  });

  it("certified retainage is due on the shorter of the contract's release period and the statutory pass-through", () => {
    const overlay = overlayFor("CA", "2025-11-18");
    const cert = (releaseDays: number | null): RetentionCandidate => ({ certificationId: "c", contractId: "k", amountCents: 500_00, isFinal: true, releaseDays, offsetCents: 0, overlay });
    const due = (releaseDays: number | null) => planWaterfall(payment({ amountCents: 500_00, retentionCents: 500_00, includesRetention: true }), [], [cert(releaseDays)]).releases[0].payByAt;
    expect(due(30)).toEqual(addDays(received, overlay.retentionPassThroughDays!));
    expect(due(3)).toEqual(addDays(received, 3));
    expect(due(null)).toEqual(addDays(received, overlay.retentionPassThroughDays!));
  });

  it("certified retainage waits when the owner's payment carries no retention", () => {
    const plan = planWaterfall(payment({ amountCents: 500_00 }), [], [{ certificationId: "c", contractId: "k", amountCents: 500_00, isFinal: false, releaseDays: 10, offsetCents: 0, overlay: overlayFor("CA", "2025-11-18") }]);
    expect(plan.releases).toEqual([]);
    expect(plan.warnings.map((w) => w.code)).toContain("retention_not_funded");
  });
});
