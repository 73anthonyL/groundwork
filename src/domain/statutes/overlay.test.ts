/** Boundaries of the statutory overlay: effective dates, project-size thresholds, day types, and the waiver pairings. */
import { describe, expect, it } from "vitest";
import { STATES, STATE_LAW, overlayFor, retentionCapBpsFor, statuteId } from "./index";
import { WAIVER_TITLES, unconditionalCounterpart, waiverBody, waiverMeta, type WaiverFields, type WaiverFormId } from "../waivers/ca";

describe("retainage cap", () => {
  it("California's 5% cap starts with contracts entered into on 2026-01-01, to the day", () => {
    expect(retentionCapBpsFor("CA", "2025-12-31")).toBeNull();
    expect(retentionCapBpsFor("CA", "2026-01-01")).toBe(500);
    expect(retentionCapBpsFor("CA", "2027-06-30")).toBe(500);
  });

  it("a cap tied to project size applies at the threshold and not one cent below it", () => {
    expect(retentionCapBpsFor("NY", "2026-06-01", { primeContractSumCents: 150_000_00 })).toBe(STATE_LAW.NY.retainageCap.bps);
    expect(retentionCapBpsFor("NY", "2026-06-01", { primeContractSumCents: 150_000_00 - 1 })).toBeNull();
    // When the prime contract sum is not known, the cap is applied rather than assumed away.
    expect(retentionCapBpsFor("NY", "2026-06-01")).toBe(STATE_LAW.NY.retainageCap.bps);
    expect(retentionCapBpsFor("NY", "2026-06-01", { primeContractSumCents: null })).toBe(STATE_LAW.NY.retainageCap.bps);
  });

  it("is null for a state with no cap and for a state that is not on file", () => {
    expect(retentionCapBpsFor("TX", "2026-06-01")).toBeNull();
    expect(retentionCapBpsFor("ZZ", "2026-06-01")).toBeNull();
  });

  it("the overlay never carries a cap above the researched ceiling, and a step-down only where there is a cap", () => {
    for (const s of STATES) {
      for (const executedOn of ["2020-01-01", "2026-06-01"]) {
        const o = overlayFor(s.state, executedOn, { primeContractSumCents: 10_000_000_00 });
        if (o.retentionCapBps !== null) {
          expect(s.retainageCap.bps, s.state).not.toBeNull();
          expect(o.retentionCapBps, s.state).toBeLessThanOrEqual(s.retainageCap.bps!);
          expect(o.retentionCapBps).toBeGreaterThanOrEqual(0);
        }
        if (o.retentionCapAfterHalfBps != null) {
          expect(o.retentionCapBps, s.state).not.toBeNull();
          expect(o.retentionCapAfterHalfBps, s.state).toBeLessThanOrEqual(o.retentionCapBps!);
        }
      }
    }
  });
});

describe("overlayFor", () => {
  it("an unknown state loads nothing, so the engine falls back to contract terms", () => {
    expect(overlayFor("ZZ", "2026-06-01")).toEqual({ state: "ZZ", loaded: false, progressPaymentDaysDefault: null, retentionPassThroughDays: null, retentionCapBps: null, payIfPaidVoid: false, waiverForms: null });
  });

  it("mirrors the researched record for every state", () => {
    for (const s of STATES) {
      const o = overlayFor(s.state, "2026-06-01");
      expect(o.loaded).toBe(true);
      expect(o.progressPaymentDaysDefault, s.state).toBe(s.promptPay.days);
      expect(o.progressPaymentOverridable, s.state).toBe(s.promptPay.contractCanOverride);
      expect(o.retentionPassThroughDays, s.state).toBe(s.retainageRelease.days);
      expect(o.payIfPaidVoid, s.state).toBe(s.payIfPaid.status === "void");
      expect(["calendar", "business"]).toContain(o.dayType);
      // Only California's statutory waiver text is held; nowhere else may claim a statutory form.
      expect(o.waiverForms === null, s.state).toBe(s.state !== "CA");
    }
  });

  it("counts Kansas and Kentucky in business days and everyone else in calendar days", () => {
    expect(STATES.filter((s) => overlayFor(s.state, "2026-06-01").dayType === "business").map((s) => s.state).sort()).toEqual(["KS", "KY"]);
  });

  it("statute ids are stable: California keeps its section ids, other states use STATE_RULE", () => {
    expect(statuteId("CA", "promptPay")).toBe("CA_BPC_7108_5");
    expect(statuteId("TX", "promptPay")).toBe("TX_PROMPT_PAY");
    expect(statuteId("NY", "retentionCap")).toBe("NY_RETAINAGE_CAP");
  });
});

describe("waiver forms", () => {
  const fields = (form: WaiverFormId, over: Partial<WaiverFields> = {}): WaiverFields => ({ form, claimant: "Ironline Steel", customer: "Meridian Builders", jobLocation: "Oakland, CA", owner: "Bayview Health", throughDate: "2026-09-30", amountCents: 9_000_050, disputedClaimsCents: null, exceptions: null, ...over });

  it("each conditional form pairs with the unconditional form of the same kind, and unconditional forms map to themselves", () => {
    expect(unconditionalCounterpart("cp_8132")).toBe("up_8134");
    expect(unconditionalCounterpart("cf_8136")).toBe("uf_8138");
    expect(unconditionalCounterpart("up_8134")).toBe("up_8134");
    expect(unconditionalCounterpart("uf_8138")).toBe("uf_8138");
    for (const form of Object.keys(WAIVER_TITLES) as WaiverFormId[]) {
      const pair = WAIVER_TITLES[unconditionalCounterpart(form)];
      expect(pair.conditional).toBe(false);
      expect(pair.final).toBe(WAIVER_TITLES[form].final);
    }
  });

  it("states the release amount to the cent on every form, in every state", () => {
    for (const form of Object.keys(WAIVER_TITLES) as WaiverFormId[]) {
      for (const state of [undefined, "CA", "TX", "NY"]) {
        expect(waiverBody(fields(form, { state })).join("\n"), `${form} ${state}`).toContain("$90,000.50");
      }
    }
  });

  it("a conditional waiver says it takes effect only on payment; an unconditional one warns the claimant", () => {
    for (const state of ["CA", "TX", "NY"]) {
      expect(waiverBody(fields("cp_8132", { state })).join("\n")).toMatch(/EFFECTIVE ON RECEIPT OF PAYMENT|ONLY WHEN THE CLAIMANT ACTUALLY RECEIVES THE PAYMENT/);
      expect(waiverBody(fields("up_8134", { state })).join("\n")).toMatch(/UNCONDITIONAL/);
      expect(waiverMeta("cp_8132", state).conditional).toBe(true);
      expect(waiverMeta("uf_8138", state)).toMatchObject({ conditional: false, final: true });
    }
  });

  it("only California's forms are presented as statutory", () => {
    expect(waiverMeta("cp_8132", "CA")).toMatchObject({ statutory: true, notice: null });
    for (const s of STATES.filter((x) => x.state !== "CA")) expect(waiverMeta("cp_8132", s.state).statutory, s.state).toBe(false);
  });
});
