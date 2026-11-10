/**
 * Statutory overlay: what each state's private-works payment law does to a subcontract's terms.
 * Applied by code from the governing state, never by the model.
 *
 * `data/states.json` holds one researched record per jurisdiction (50 states and DC): prompt payment
 * to subcontractors, the retainage cap, the retainage pass-through deadline, whether pay-if-paid is
 * enforceable, and lien waiver form rules. Every rule carries its citation, a source URL and a
 * confidence level (high: read in the statute text; medium: consistent secondary sources; low: a
 * single or uncertain source). A rule the research could not confirm is null, and the engine falls
 * back to the contract's own terms and says so. Nothing here is legal advice.
 */
import raw from "./data/states.json";

export type Confidence = "high" | "medium" | "low";
export type PayIfPaidStatus = "void" | "enforceable" | "limited" | "unsettled";
type Sourced = { cite: string; url: string; confidence: Confidence; notes: string };

export type StateLaw = {
  state: string;
  name: string;
  promptPay: Sourced & { days: number | null; contractCanOverride: boolean | null; lateInterest: string | null };
  retainageCap: Sourced & { bps: number | null; appliesFrom: string | null; conditions: string };
  retainageRelease: Sourced & { days: number | null; trigger: string | null };
  payIfPaid: Sourced & { status: PayIfPaidStatus };
  lienWaiver: Sourced & { statutoryFormRequired: boolean; forms: { type: string; cite: string }[]; notarizationRequired: boolean | null; advanceWaiverVoid: boolean | null };
};

export const STATE_LAW: Record<string, StateLaw> = Object.fromEntries((raw as StateLaw[]).map((s) => [s.state, s]));
export const STATES: StateLaw[] = Object.values(STATE_LAW).sort((a, b) => a.name.localeCompare(b.name));

/**
 * Structured readings of conditions the research recorded as prose. Kept beside the data rather than
 * in it so the researched record stays a faithful copy of its sources.
 */
const BUSINESS_DAYS: Record<string, true> = { KS: true, KY: true };
/** Caps that apply only when the owner's prime contract is at least this large (cents). */
const CAP_MIN_PRIME_CENTS: Record<string, number> = { CO: 150_000_00, NY: 150_000_00, RI: 250_000_00, MA: 3_000_000_00 };

export type StatuteId = string;
export type StatuteRef = { cite: string; title: string; summary: string; url?: string; confidence?: Confidence; state?: string };

export type RuleKey = "promptPay" | "retentionCap" | "retentionRelease" | "payIfPaid" | "lienWaiver";

/** California keeps its original, section-specific ids; other states use STATE_RULE ids. */
const CA_IDS: Record<RuleKey, StatuteId> = {
  promptPay: "CA_BPC_7108_5",
  retentionCap: "CA_CIV_8811",
  retentionRelease: "CA_CIV_8814",
  payIfPaid: "CA_CLARKE_V_SAFECO",
  lienWaiver: "CA_CIV_8132",
};
const SUFFIX: Record<RuleKey, string> = { promptPay: "PROMPT_PAY", retentionCap: "RETAINAGE_CAP", retentionRelease: "RETAINAGE_RELEASE", payIfPaid: "PAY_IF_PAID", lienWaiver: "LIEN_WAIVER" };

export function statuteId(state: string, rule: RuleKey): StatuteId {
  return state === "CA" ? CA_IDS[rule] : `${state}_${SUFFIX[rule]}`;
}

const CA_STATUTES: Record<string, StatuteRef> = {
  CA_BPC_7108_5: {
    cite: "Bus. & Prof. Code §7108.5",
    title: "Prompt payment to subcontractors",
    summary: "A prime contractor must pay each subcontractor within 7 days of receiving a progress payment, unless otherwise agreed in writing. Late payment carries a 2% per month penalty plus attorney's fees.",
  },
  CA_CIV_8814: { cite: "Civ. Code §8814", title: "Retention pass-through", summary: "Within 10 days of receiving retention proceeds from the owner, the direct contractor must pay each subcontractor its share." },
  CA_CIV_8811: { cite: "Civ. Code §8811", title: "Retention cap on private works", summary: "For contracts entered into on or after January 1, 2026, retention withheld may not exceed 5% of the payment." },
  CA_CLARKE_V_SAFECO: {
    cite: "Wm. R. Clarke Corp. v. Safeco (1997) 15 Cal.4th 882",
    title: "Pay-if-paid unenforceable",
    summary: "A clause that makes owner payment a condition precedent to the subcontractor's right to be paid is void in California. The clause is read as pay-when-paid: payment within a reasonable time, and the §7108.5 clock still runs.",
  },
  CA_CIV_8132: { cite: "Civ. Code §8132", title: "Conditional waiver and release on progress payment", summary: "Statutory form." },
  CA_CIV_8134: { cite: "Civ. Code §8134", title: "Unconditional waiver and release on progress payment", summary: "Statutory form." },
  CA_CIV_8136: { cite: "Civ. Code §8136", title: "Conditional waiver and release on final payment", summary: "Statutory form." },
  CA_CIV_8138: { cite: "Civ. Code §8138", title: "Unconditional waiver and release on final payment", summary: "Statutory form." },
};

const PAY_IF_PAID_TEXT: Record<PayIfPaidStatus, string> = {
  void: "A clause making owner payment a condition of paying the subcontractor is unenforceable.",
  enforceable: "A clearly worded pay-if-paid clause is enforced.",
  limited: "Pay-if-paid is enforced only within statutory limits.",
  unsettled: "No controlling authority settles whether pay-if-paid is enforceable.",
};

function daysLabel(state: string, n: number): string {
  return `${n} ${BUSINESS_DAYS[state] ? "business " : ""}day${n === 1 ? "" : "s"}`;
}

function generated(s: StateLaw): Record<string, StatuteRef> {
  const out: Record<string, StatuteRef> = {};
  const put = (rule: RuleKey, src: Sourced, title: string, summary: string) => {
    if (!src.cite) return;
    out[statuteId(s.state, rule)] = { cite: src.cite, title, summary, url: src.url || undefined, confidence: src.confidence, state: s.state };
  };
  if (s.promptPay.days !== null) {
    const o = s.promptPay.contractCanOverride;
    put("promptPay", s.promptPay, "Prompt payment to subcontractors", `Pay each subcontractor within ${daysLabel(s.state, s.promptPay.days)} of receiving payment${o === true ? ", unless otherwise agreed in writing" : o === false ? "; the contract cannot lengthen this" : ""}.${s.promptPay.lateInterest ? ` Late payment: ${s.promptPay.lateInterest}.` : ""}`);
  }
  if (s.retainageCap.bps !== null) {
    put("retentionCap", s.retainageCap, "Retainage cap on private works", s.retainageCap.bps === 0 ? "Retainage may not be withheld." : `Retainage may not exceed ${s.retainageCap.bps / 100}%${s.retainageCap.appliesFrom ? ` on contracts entered into on or after ${s.retainageCap.appliesFrom}` : ""}.`);
  }
  if (s.retainageRelease.days !== null) {
    put("retentionRelease", s.retainageRelease, "Retainage pass-through", `Pay each subcontractor its retainage within ${s.retainageRelease.days} days ${s.retainageRelease.trigger ?? "of receiving it"}.`);
  }
  put("payIfPaid", s.payIfPaid, `Pay-if-paid ${s.payIfPaid.status}`, PAY_IF_PAID_TEXT[s.payIfPaid.status]);
  put("lienWaiver", s.lienWaiver, "Lien waiver forms", s.lienWaiver.statutoryFormRequired ? "The state prescribes statutory lien waiver forms." : "No statutory lien waiver form is prescribed.");
  return out;
}

/** Every statute or case the engine can cite, by id. California's hand-written entries win. */
export const STATUTES: Record<StatuteId, StatuteRef> = {
  ...Object.assign({}, ...STATES.map(generated)),
  ...Object.fromEntries(Object.entries(CA_STATUTES).map(([id, v]) => [id, { ...v, state: "CA", url: caUrl(id), confidence: id === "CA_CLARKE_V_SAFECO" ? ("medium" as const) : ("high" as const) }])),
};

function caUrl(id: string): string | undefined {
  const ca = STATE_LAW.CA;
  if (!ca) return undefined;
  return id === "CA_BPC_7108_5" ? ca.promptPay.url : id === "CA_CIV_8811" ? ca.retainageCap.url : id === "CA_CIV_8814" ? ca.retainageRelease.url : id === "CA_CLARKE_V_SAFECO" ? ca.payIfPaid.url : ca.lienWaiver.url;
}

export function statute(id: StatuteId): StatuteRef {
  return STATUTES[id] ?? { cite: id, title: "Statute", summary: "" };
}

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

export type OverlayContext = { primeContractSumCents?: number | null };

export type StatutoryOverlay = {
  state: string;
  /** Whether a researched record exists for this state. Unknown states fall back to contract terms. */
  loaded: boolean;
  /** Days to pay a subcontractor after receiving payment; null when the state has no private rule. */
  progressPaymentDaysDefault: number | null;
  /** False: the contract cannot lengthen the statutory period. Null: the statute is silent. */
  progressPaymentOverridable?: boolean | null;
  dayType?: "calendar" | "business";
  retentionPassThroughDays: number | null;
  /** Cap that applies to this contract (by date and project size), or null. */
  retentionCapBps: number | null;
  payIfPaidVoid: boolean;
  payIfPaid?: PayIfPaidStatus;
  waiverForms: { conditionalProgress: StatuteId; unconditionalProgress: StatuteId; conditionalFinal: StatuteId; unconditionalFinal: StatuteId } | null;
  /** The state prescribes a statutory waiver form; `waiverForms` is set only where we hold its text. */
  statutoryWaiverForm?: boolean;
  waiverNotarization?: boolean | null;
  /** Statute ids behind each rule, for citation. */
  cites?: Partial<Record<RuleKey, StatuteId>>;
  confidence?: Partial<Record<RuleKey, Confidence>>;
  /** Conditions the engine does not evaluate and a person should confirm. */
  caveats?: string[];
};

/** 5% cap applies when the subcontract was entered into on/after 2026-01-01 (ISO date compare). */
export function retentionCapBpsFor(state: string, contractExecutedOn: string, ctx: OverlayContext = {}): number | null {
  const s = STATE_LAW[state];
  if (!s || s.retainageCap.bps === null) return null;
  if (s.retainageCap.appliesFrom && contractExecutedOn < s.retainageCap.appliesFrom) return null;
  const min = CAP_MIN_PRIME_CENTS[state];
  if (min && ctx.primeContractSumCents != null && ctx.primeContractSumCents < min) return null;
  return s.retainageCap.bps;
}

export function overlayFor(state: string, contractExecutedOn: string, ctx: OverlayContext = {}): StatutoryOverlay {
  const s = STATE_LAW[state];
  if (!s) {
    return { state, loaded: false, progressPaymentDaysDefault: null, retentionPassThroughDays: null, retentionCapBps: null, payIfPaidVoid: false, waiverForms: null };
  }
  const cap = retentionCapBpsFor(state, contractExecutedOn, ctx);
  const cite = (rule: RuleKey) => (STATUTES[statuteId(state, rule)] ? statuteId(state, rule) : undefined);
  const caveats: string[] = [];
  if (cap !== null && s.retainageCap.conditions) caveats.push(`Retainage cap: ${s.retainageCap.conditions}`);
  if (s.payIfPaid.status === "limited" || s.payIfPaid.status === "unsettled") caveats.push(`Pay-if-paid is ${s.payIfPaid.status}: ${s.payIfPaid.notes}`);
  if (s.lienWaiver.statutoryFormRequired && state !== "CA") caveats.push(`${s.name} prescribes statutory lien waiver forms (${s.lienWaiver.cite}). Groundwork drafts a general-form waiver here; replace it with the statutory text before relying on it.`);
  if (s.lienWaiver.notarizationRequired) caveats.push(`${s.name} lien waivers must be notarized; a typed electronic signature alone is not enough.`);
  return {
    state,
    loaded: true,
    progressPaymentDaysDefault: s.promptPay.days,
    progressPaymentOverridable: s.promptPay.contractCanOverride,
    dayType: BUSINESS_DAYS[state] ? "business" : "calendar",
    retentionPassThroughDays: s.retainageRelease.days,
    retentionCapBps: cap,
    payIfPaidVoid: s.payIfPaid.status === "void",
    payIfPaid: s.payIfPaid.status,
    waiverForms: state === "CA" ? { conditionalProgress: "CA_CIV_8132", unconditionalProgress: "CA_CIV_8134", conditionalFinal: "CA_CIV_8136", unconditionalFinal: "CA_CIV_8138" } : null,
    statutoryWaiverForm: s.lienWaiver.statutoryFormRequired,
    waiverNotarization: s.lienWaiver.notarizationRequired,
    cites: { promptPay: cite("promptPay"), retentionCap: cite("retentionCap"), retentionRelease: cite("retentionRelease"), payIfPaid: cite("payIfPaid"), lienWaiver: cite("lienWaiver") },
    confidence: { promptPay: s.promptPay.confidence, retentionCap: s.retainageCap.confidence, retentionRelease: s.retainageRelease.confidence, payIfPaid: s.payIfPaid.confidence, lienWaiver: s.lienWaiver.confidence },
    caveats,
  };
}

/** Coverage counts for the statute library and the README. */
export function coverage() {
  const n = (f: (s: StateLaw) => boolean) => STATES.filter(f).length;
  return {
    jurisdictions: STATES.length,
    promptPay: n((s) => s.promptPay.days !== null),
    retainageCap: n((s) => s.retainageCap.bps !== null),
    retainageRelease: n((s) => s.retainageRelease.days !== null),
    payIfPaidVoid: n((s) => s.payIfPaid.status === "void"),
    payIfPaidLimited: n((s) => s.payIfPaid.status === "limited"),
    statutoryWaiverForms: n((s) => s.lienWaiver.statutoryFormRequired),
  };
}
