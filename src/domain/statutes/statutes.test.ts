import { describe, expect, it } from "vitest";
import { STATES, STATE_LAW, STATUTES, coverage, overlayFor, statute } from "./index";
import { waiverBody, waiverMeta } from "../waivers/ca";

describe("statutory overlay data", () => {
  it("covers all 50 states and DC, each with the five rules", () => {
    expect(STATES).toHaveLength(51);
    expect(new Set(STATES.map((s) => s.state)).size).toBe(51);
    for (const s of STATES) {
      for (const rule of [s.promptPay, s.retainageCap, s.retainageRelease, s.payIfPaid, s.lienWaiver]) {
        expect(["high", "medium", "low"]).toContain(rule.confidence);
      }
      expect(["void", "enforceable", "limited", "unsettled"]).toContain(s.payIfPaid.status);
    }
  });

  it("never states a number without a citation", () => {
    for (const s of STATES) {
      if (s.promptPay.days !== null) expect(s.promptPay.cite, `${s.state} prompt pay`).not.toBe("");
      if (s.retainageCap.bps !== null) expect(s.retainageCap.cite, `${s.state} cap`).not.toBe("");
      if (s.retainageRelease.days !== null) expect(s.retainageRelease.cite, `${s.state} release`).not.toBe("");
      if (s.payIfPaid.status === "void" || s.payIfPaid.status === "limited") expect(s.payIfPaid.cite, `${s.state} pay-if-paid`).not.toBe("");
    }
  });

  it("keeps numbers in plausible ranges", () => {
    for (const s of STATES) {
      if (s.promptPay.days !== null) { expect(s.promptPay.days).toBeGreaterThan(0); expect(s.promptPay.days).toBeLessThanOrEqual(60); }
      if (s.retainageCap.bps !== null) { expect(s.retainageCap.bps).toBeGreaterThanOrEqual(0); expect(s.retainageCap.bps).toBeLessThanOrEqual(1000); }
      if (s.retainageCap.appliesFrom) expect(s.retainageCap.appliesFrom).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("California matches the rules the engine was built on", () => {
    const o = overlayFor("CA", "2026-03-01");
    expect(o).toMatchObject({ loaded: true, progressPaymentDaysDefault: 7, progressPaymentOverridable: true, retentionPassThroughDays: 10, retentionCapBps: 500, payIfPaidVoid: true });
    expect(overlayFor("CA", "2025-11-18").retentionCapBps).toBeNull();
    expect(o.cites).toMatchObject({ promptPay: "CA_BPC_7108_5", retentionCap: "CA_CIV_8811", retentionRelease: "CA_CIV_8814", payIfPaid: "CA_CLARKE_V_SAFECO" });
    expect(o.waiverForms?.conditionalProgress).toBe("CA_CIV_8132");
  });

  it("every cited id resolves to a statute with a citation", () => {
    for (const s of STATES) {
      const o = overlayFor(s.state, "2026-06-01");
      for (const id of Object.values(o.cites ?? {})) if (id) expect(STATUTES[id]?.cite, id).toBeTruthy();
    }
    expect(statute("NOPE").cite).toBe("NOPE");
  });

  it("flags what the engine does not evaluate", () => {
    expect(overlayFor("TX", "2026-06-01").caveats?.join(" ")).toMatch(/statutory lien waiver forms/);
    expect(overlayFor("MS", "2026-06-01").caveats?.join(" ")).toMatch(/notarized/);
    expect(STATE_LAW.TX.lienWaiver.statutoryFormRequired).toBe(true);
    expect(coverage().jurisdictions).toBe(51);
  });
});

describe("waiver forms by state", () => {
  const fields = { form: "cp_8132" as const, claimant: "Lone Star Steel", customer: "Meridian Builders", jobLocation: "Austin, TX", owner: "Owner LLC", throughDate: "2026-09-30", amountCents: 4_500_000, disputedClaimsCents: null, exceptions: null };

  it("California keeps its statutory text", () => {
    expect(waiverBody(fields).join("\n")).toContain("California Civil Code Section 8132");
    expect(waiverBody({ ...fields, state: "CA" }).join("\n")).toContain("STOP PAYMENT NOTICE");
  });

  it("a state with its own statutory form gets a general draft that says so on its face", () => {
    const body = waiverBody({ ...fields, state: "TX" }).join("\n");
    expect(body).not.toContain("California");
    expect(body).toMatch(/PRESCRIBES A STATUTORY FORM/);
    expect(body).toContain("$45,000.00");
    expect(waiverMeta("cp_8132", "TX")).toMatchObject({ conditional: true, statutory: false });
  });

  it("a state without one gets the general form with no warning", () => {
    expect(waiverMeta("up_8134", "NY").notice).toBeNull();
    expect(waiverBody({ ...fields, form: "up_8134", state: "NY" }).join("\n")).toContain("UNCONDITIONAL");
  });
});
