/**
 * California statutory overlay. Applied by code from the governing state, never by the LLM.
 * Sources: Bus. & Prof. Code §7108.5; Civ. Code §§8811, 8814, 8132, 8134, 8136, 8138;
 * Wm. R. Clarke Corp. v. Safeco Ins. Co., 15 Cal.4th 882 (1997).
 */

export type StatuteId =
  | "CA_BPC_7108_5"
  | "CA_CIV_8814"
  | "CA_CIV_8811"
  | "CA_CLARKE_V_SAFECO"
  | "CA_CIV_8132"
  | "CA_CIV_8134"
  | "CA_CIV_8136"
  | "CA_CIV_8138";

export const STATUTES: Record<StatuteId, { cite: string; title: string; summary: string }> = {
  CA_BPC_7108_5: {
    cite: "Bus. & Prof. Code §7108.5",
    title: "Prompt payment to subcontractors",
    summary:
      "A prime contractor must pay each subcontractor within 7 days of receiving a progress payment, unless otherwise agreed in writing. Late payment carries a 2% per month penalty plus attorney's fees.",
  },
  CA_CIV_8814: {
    cite: "Civ. Code §8814",
    title: "Retention pass-through",
    summary:
      "Within 10 days of receiving retention proceeds from the owner, the direct contractor must pay each subcontractor its share.",
  },
  CA_CIV_8811: {
    cite: "Civ. Code §8811",
    title: "Retention cap on private works",
    summary: "For contracts entered into on or after January 1, 2026, retention withheld may not exceed 5% of the payment.",
  },
  CA_CLARKE_V_SAFECO: {
    cite: "Wm. R. Clarke Corp. v. Safeco (1997) 15 Cal.4th 882",
    title: "Pay-if-paid unenforceable",
    summary:
      "A clause that makes owner payment a condition precedent to the subcontractor's right to be paid is void in California. The clause is read as pay-when-paid: payment within a reasonable time, and the §7108.5 clock still runs.",
  },
  CA_CIV_8132: { cite: "Civ. Code §8132", title: "Conditional waiver and release on progress payment", summary: "Statutory form." },
  CA_CIV_8134: { cite: "Civ. Code §8134", title: "Unconditional waiver and release on progress payment", summary: "Statutory form." },
  CA_CIV_8136: { cite: "Civ. Code §8136", title: "Conditional waiver and release on final payment", summary: "Statutory form." },
  CA_CIV_8138: { cite: "Civ. Code §8138", title: "Unconditional waiver and release on final payment", summary: "Statutory form." },
};

export const CA = {
  /** §7108.5 default when the contract is silent or not agreed in writing. */
  progressPaymentDays: 7,
  /** §8814. */
  retentionPassThroughDays: 10,
  /** §7108.5 penalty, per month, in basis points of the late amount. */
  latePenaltyBpsPerMonth: 200,
  /** §8811 applies to contracts dated on/after this day. */
  retentionCapEffective: "2026-01-01",
  retentionCapBps: 500,
} as const;

/** 5% cap applies when the subcontract was entered into on/after 2026-01-01 (ISO date compare). */
export function retentionCapBpsFor(state: string, contractExecutedOn: string): number | null {
  if (state !== "CA") return null;
  return contractExecutedOn >= CA.retentionCapEffective ? CA.retentionCapBps : null;
}

export type StatutoryOverlay = {
  state: string;
  /** Whether a statutory overlay exists for this state. Other states fall back to contract terms + a flag. */
  loaded: boolean;
  progressPaymentDaysDefault: number | null;
  retentionPassThroughDays: number | null;
  retentionCapBps: number | null;
  payIfPaidVoid: boolean;
  waiverForms: { conditionalProgress: StatuteId; unconditionalProgress: StatuteId; conditionalFinal: StatuteId; unconditionalFinal: StatuteId } | null;
};

export function overlayFor(state: string, contractExecutedOn: string): StatutoryOverlay {
  if (state === "CA") {
    return {
      state,
      loaded: true,
      progressPaymentDaysDefault: CA.progressPaymentDays,
      retentionPassThroughDays: CA.retentionPassThroughDays,
      retentionCapBps: retentionCapBpsFor(state, contractExecutedOn),
      payIfPaidVoid: true,
      waiverForms: {
        conditionalProgress: "CA_CIV_8132",
        unconditionalProgress: "CA_CIV_8134",
        conditionalFinal: "CA_CIV_8136",
        unconditionalFinal: "CA_CIV_8138",
      },
    };
  }
  return {
    state,
    loaded: false,
    progressPaymentDaysDefault: null,
    retentionPassThroughDays: null,
    retentionCapBps: null,
    payIfPaidVoid: false,
    waiverForms: null,
  };
}
