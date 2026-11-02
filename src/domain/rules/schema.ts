/**
 * Typed payment rule set — the contract, compiled.
 *
 * Every field carries its value, the verbatim evidence Claude proposed, and (after our code runs)
 * a verification result and the human review decision. The engine reads only the `value`s of an
 * approved rule set; the evidence exists so a human can check every dollar back to a clause.
 *
 * Two schemas: `ExtractedRuleSetSchema` is what Claude must emit (structured output; no min/max
 * constraints because the API rejects them). `StrictRuleSetSchema` re-validates ranges afterwards.
 */
import { z } from "zod";

export const Confidence = z.enum(["high", "medium", "low"]);
export type Confidence = z.infer<typeof Confidence>;

export const EvidenceSchema = z.object({
  /** Verbatim, contiguous quote from the contract (≤300 chars, no ellipses). */
  quote: z.string(),
  /** 1-based page the quote appears on. */
  page: z.number(),
  confidence: Confidence,
  /** One sentence: why this clause supports the value. */
  rationale: z.string(),
});
export type Evidence = z.infer<typeof EvidenceSchema>;

function field<T extends z.ZodTypeAny>(value: T) {
  return z.object({
    value: value.nullable(),
    evidence: EvidenceSchema.nullable(),
    /** True when the contract is silent. Never infer a value from industry norms. */
    not_found: z.boolean(),
  });
}

export const TimingType = z.enum(["pay_when_paid", "pay_if_paid", "fixed_days", "silent"]);
export type TimingType = z.infer<typeof TimingType>;

export const ExtractedRuleSetSchema = z.object({
  parties: z.object({
    contractor: field(z.string()),
    subcontractor: field(z.string()),
    owner: field(z.string()),
    project: field(z.string()),
  }),
  /** Two-letter US state whose law governs, e.g. "CA". */
  governing_law_state: field(z.string()),
  timing: z.object({
    /**
     * pay_when_paid: paid N days after the contractor receives the owner's payment (timing only).
     * pay_if_paid: owner payment is a condition precedent to any obligation to pay (risk shift).
     * fixed_days: paid N days after application/invoice regardless of owner.
     * silent: no payment timing clause.
     */
    type: field(TimingType),
    /** Days in the clause, e.g. 7 or 10. */
    days: field(z.number()),
    /** True when the days are stated in the signed contract (vs. inferred). */
    agreed_in_writing: field(z.boolean()),
  }),
  retainage: z.object({
    /** Percent of each progress payment withheld, in basis points (10% = 1000). */
    percent_bps: field(z.number()),
    /** Maximum total retention as basis points of the subcontract sum, if any. */
    cap_bps: field(z.number()),
    /** When retention drops (e.g. "to 5% at 50% completion"). */
    reduction_trigger: field(z.string()),
    /** What must happen before retention is released. */
    release_condition: field(z.string()),
    /** Days after the trigger (often after the contractor receives retention from the owner). */
    release_days: field(z.number()),
  }),
  waivers: z.object({
    conditional_before_progress: field(z.boolean()),
    unconditional_after_payment: field(z.boolean()),
    lower_tier_required: field(z.boolean()),
    /** The contract requires the state's statutory waiver forms (CA Civ. Code §§8132–8138). */
    statutory_form_required: field(z.boolean()),
  }),
  offsets: z.object({
    joint_check: field(z.boolean()),
    backcharge_setoff: field(z.boolean()),
    withhold_defective: field(z.boolean()),
  }),
  stored_materials: field(z.boolean()),
  /** Anything a controller should look at: ambiguous triggers, unusual risk shifts, conflicts. */
  anomalies: z.array(
    z.object({
      /** Dotted path of the field this concerns, e.g. "retainage.release_condition", or "general". */
      field: z.string(),
      description: z.string(),
      evidence: EvidenceSchema.nullable(),
    }),
  ),
});
export type ExtractedRuleSet = z.infer<typeof ExtractedRuleSetSchema>;

/** Post-parse range checks the structured-output API cannot express. */
export const StrictRuleSetSchema = ExtractedRuleSetSchema.superRefine((r, ctx) => {
  const check = (ok: boolean, path: (string | number)[], message: string) => {
    if (!ok) ctx.addIssue({ code: "custom", path, message });
  };
  const st = r.governing_law_state.value;
  check(st === null || /^[A-Z]{2}$/.test(st), ["governing_law_state", "value"], "two-letter state");
  const d = r.timing.days.value;
  check(d === null || (Number.isInteger(d) && d >= 0 && d <= 120), ["timing", "days", "value"], "0–120 days");
  const p = r.retainage.percent_bps.value;
  check(p === null || (Number.isInteger(p) && p >= 0 && p <= 2000), ["retainage", "percent_bps", "value"], "0–20%");
  const c = r.retainage.cap_bps.value;
  check(c === null || (Number.isInteger(c) && c >= 0 && c <= 2000), ["retainage", "cap_bps", "value"], "0–20%");
  const rd = r.retainage.release_days.value;
  check(rd === null || (Number.isInteger(rd) && rd >= 0 && rd <= 365), ["retainage", "release_days", "value"], "0–365 days");
  for (const [i, a] of r.anomalies.entries()) {
    check(a.description.length > 0, ["anomalies", i, "description"], "empty");
  }
});

// ─── Review-time annotations (added by our code, never by the model) ────────

export const VerificationSchema = z.object({
  /** exact: found on the claimed page; fuzzy: ≥0.90 similarity; unverified: not found; none: no quote. */
  status: z.enum(["exact", "fuzzy", "unverified", "none"]),
  /** Page where the quote was actually found (may differ by ±1 from the claim). */
  page: z.number().nullable(),
  score: z.number().nullable(),
});
export type Verification = z.infer<typeof VerificationSchema>;

export const ReviewStateSchema = z.enum(["auto_accepted", "needs_review", "escalated", "accepted", "overridden"]);
export type ReviewState = z.infer<typeof ReviewStateSchema>;

export const ReviewSchema = z.object({
  state: ReviewStateSchema,
  /** Why the field landed in this state (shown in the UI). */
  reasons: z.array(z.string()),
  /** Value the reviewer entered when overriding, with their note. */
  override: z.object({ value: z.unknown(), note: z.string(), by: z.string(), at: z.string() }).nullable(),
});
export type Review = z.infer<typeof ReviewSchema>;

/** Flat list of rule field paths, in display order. */
export const RULE_FIELDS = [
  "parties.contractor",
  "parties.subcontractor",
  "parties.owner",
  "parties.project",
  "governing_law_state",
  "timing.type",
  "timing.days",
  "timing.agreed_in_writing",
  "retainage.percent_bps",
  "retainage.cap_bps",
  "retainage.reduction_trigger",
  "retainage.release_condition",
  "retainage.release_days",
  "waivers.conditional_before_progress",
  "waivers.unconditional_after_payment",
  "waivers.lower_tier_required",
  "waivers.statutory_form_required",
  "offsets.joint_check",
  "offsets.backcharge_setoff",
  "offsets.withhold_defective",
  "stored_materials",
] as const;
export type RuleFieldPath = (typeof RULE_FIELDS)[number];

/** Fields the engine cannot run without. */
export const REQUIRED_FIELDS: RuleFieldPath[] = [
  "governing_law_state",
  "timing.type",
  "retainage.percent_bps",
  "retainage.release_condition",
  "waivers.conditional_before_progress",
];

export type RuleField<T = unknown> = { value: T | null; evidence: Evidence | null; not_found: boolean };

export function getField(rules: ExtractedRuleSet, path: RuleFieldPath): RuleField {
  const parts = path.split(".");
  let cur: unknown = rules;
  for (const p of parts) cur = (cur as Record<string, unknown>)[p];
  return cur as RuleField;
}

/** The values alone: what a spec/answer key looks like and what the engine consumes. */
export type RuleValues = {
  parties: { contractor: string | null; subcontractor: string | null; owner: string | null; project: string | null };
  governing_law_state: string | null;
  timing: { type: TimingType | null; days: number | null; agreed_in_writing: boolean | null };
  retainage: {
    percent_bps: number | null;
    cap_bps: number | null;
    reduction_trigger: string | null;
    release_condition: string | null;
    release_days: number | null;
  };
  waivers: {
    conditional_before_progress: boolean | null;
    unconditional_after_payment: boolean | null;
    lower_tier_required: boolean | null;
    statutory_form_required: boolean | null;
  };
  offsets: { joint_check: boolean | null; backcharge_setoff: boolean | null; withhold_defective: boolean | null };
  stored_materials: boolean | null;
};

export function toValues(rules: ExtractedRuleSet): RuleValues {
  const v = (f: RuleField) => (f.not_found ? null : f.value);
  return {
    parties: {
      contractor: v(rules.parties.contractor) as string | null,
      subcontractor: v(rules.parties.subcontractor) as string | null,
      owner: v(rules.parties.owner) as string | null,
      project: v(rules.parties.project) as string | null,
    },
    governing_law_state: v(rules.governing_law_state) as string | null,
    timing: {
      type: v(rules.timing.type) as TimingType | null,
      days: v(rules.timing.days) as number | null,
      agreed_in_writing: v(rules.timing.agreed_in_writing) as boolean | null,
    },
    retainage: {
      percent_bps: v(rules.retainage.percent_bps) as number | null,
      cap_bps: v(rules.retainage.cap_bps) as number | null,
      reduction_trigger: v(rules.retainage.reduction_trigger) as string | null,
      release_condition: v(rules.retainage.release_condition) as string | null,
      release_days: v(rules.retainage.release_days) as number | null,
    },
    waivers: {
      conditional_before_progress: v(rules.waivers.conditional_before_progress) as boolean | null,
      unconditional_after_payment: v(rules.waivers.unconditional_after_payment) as boolean | null,
      lower_tier_required: v(rules.waivers.lower_tier_required) as boolean | null,
      statutory_form_required: v(rules.waivers.statutory_form_required) as boolean | null,
    },
    offsets: {
      joint_check: v(rules.offsets.joint_check) as boolean | null,
      backcharge_setoff: v(rules.offsets.backcharge_setoff) as boolean | null,
      withhold_defective: v(rules.offsets.withhold_defective) as boolean | null,
    },
    stored_materials: v(rules.stored_materials) as boolean | null,
  };
}
