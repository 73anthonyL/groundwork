/**
 * Build an extracted rule set from a seed spec + the PDF's page texts, without calling the model.
 * The spec is the answer key; each field's `anchor` is a verbatim phrase from the contract that
 * we locate in the page texts to produce honest evidence (quote + page).
 */
import type { ExtractedRuleSet, Evidence, RuleValues, Confidence } from "./schema";
import { normalizeForMatch } from "@/lib/verify/quote";

export type ContractSpec = {
  slug: string;
  contractKey: string;
  file: string;
  notes?: string;
  expected: RuleValues;
  /** field path → verbatim phrase in the contract (null when the field is not in the contract). */
  anchors: Record<string, string | null>;
  anomalies: { field: string; description: string; anchor: string | null }[];
  /** Optional per-field confidence override (default high). */
  confidence?: Record<string, Confidence>;
};

export function locatePage(pageTexts: string[], phrase: string): number | null {
  const q = normalizeForMatch(phrase);
  for (let i = 0; i < pageTexts.length; i++) if (normalizeForMatch(pageTexts[i]).includes(q)) return i + 1;
  return null;
}

function evidence(spec: ContractSpec, pageTexts: string[], path: string, rationale: string): Evidence | null {
  const anchor = spec.anchors[path];
  if (!anchor) return null;
  const page = locatePage(pageTexts, anchor);
  if (page === null) throw new Error(`anchor for ${path} not found in ${spec.file}: "${anchor.slice(0, 60)}…"`);
  return { quote: anchor, page, confidence: spec.confidence?.[path] ?? "high", rationale };
}

export function ruleSetFromSpec(spec: ContractSpec, pageTexts: string[]): ExtractedRuleSet {
  const v = spec.expected;
  const f = <T>(path: string, value: T | null, rationale: string) => {
    const ev = evidence(spec, pageTexts, path, rationale);
    const notFound = value === null && ev === null;
    return { value: notFound ? null : value, evidence: ev, not_found: notFound };
  };
  return {
    parties: {
      contractor: f("parties.contractor", v.parties.contractor, "Named as Contractor in the preamble."),
      subcontractor: f("parties.subcontractor", v.parties.subcontractor, "Named as Subcontractor in the preamble."),
      owner: f("parties.owner", v.parties.owner, "Owner identified in the recitals."),
      project: f("parties.project", v.parties.project, "Project identified in the recitals."),
    },
    governing_law_state: f("governing_law_state", v.governing_law_state, "Governing-law clause names California."),
    timing: {
      type: f("timing.type", v.timing.type, "Characterizes the owner-payment linkage in the payment article."),
      days: f("timing.days", v.timing.days, "Days stated in the progress-payment clause."),
      agreed_in_writing: f("timing.agreed_in_writing", v.timing.agreed_in_writing, "The period is written into the signed subcontract."),
    },
    retainage: {
      percent_bps: f("retainage.percent_bps", v.retainage.percent_bps, "Retention percentage in the retention article."),
      cap_bps: f("retainage.cap_bps", v.retainage.cap_bps, "No maximum total retention is stated."),
      reduction_trigger: f("retainage.reduction_trigger", v.retainage.reduction_trigger, "Describes when the retention rate steps down."),
      release_condition: f("retainage.release_condition", v.retainage.release_condition, "The condition for releasing retention."),
      release_days: f("retainage.release_days", v.retainage.release_days, "Days after the contractor receives retention from the owner."),
    },
    waivers: {
      conditional_before_progress: f("waivers.conditional_before_progress", v.waivers.conditional_before_progress, "Conditional progress waiver required with each application."),
      unconditional_after_payment: f("waivers.unconditional_after_payment", v.waivers.unconditional_after_payment, "Unconditional waiver required for prior payments."),
      lower_tier_required: f("waivers.lower_tier_required", v.waivers.lower_tier_required, "Lower-tier releases required."),
      statutory_form_required: f("waivers.statutory_form_required", v.waivers.statutory_form_required, "Cites the Civil Code statutory forms."),
    },
    offsets: {
      joint_check: f("offsets.joint_check", v.offsets.joint_check, "Joint-check right."),
      backcharge_setoff: f("offsets.backcharge_setoff", v.offsets.backcharge_setoff, "Backcharge and setoff rights."),
      withhold_defective: f("offsets.withhold_defective", v.offsets.withhold_defective, "Right to withhold for defective work."),
    },
    stored_materials: f("stored_materials", v.stored_materials, "Whether stored materials are payable."),
    anomalies: spec.anomalies.map((a) => ({
      field: a.field,
      description: a.description,
      evidence: a.anchor
        ? (() => {
            const page = locatePage(pageTexts, a.anchor!);
            if (page === null) throw new Error(`anomaly anchor not found in ${spec.file}`);
            return { quote: a.anchor!, page, confidence: "high" as const, rationale: a.description };
          })()
        : null,
    })),
  };
}
