/**
 * Review-time annotation of an extracted rule set. Our code decides what a human must look at.
 *
 * Policy (never silent):
 *   auto_accepted  high confidence + quote verified (exact, or fuzzy ≥ 0.95) + no anomaly on the field
 *   needs_review   medium confidence, fuzzy 0.90–0.95, or an anomaly attached to the field
 *   escalated      low confidence, quote unverified, a required field not found, or a statutory conflict
 * Approval is blocked while any field is escalated or needs_review and unresolved.
 */
import { createHash } from "node:crypto";
import {
  ExtractedRuleSetSchema,
  REQUIRED_FIELDS,
  RULE_FIELDS,
  getField,
  toValues,
  type ExtractedRuleSet,
  type Review,
  type RuleFieldPath,
  type RuleValues,
  type Verification,
} from "@/domain/rules/schema";
import { overlayFor, type StatutoryOverlay } from "@/domain/statutes";
import { verifyQuote } from "@/lib/verify/quote";

export type FieldAnnotation = { verification: Verification; review: Review };

export type StoredRules = {
  extracted: ExtractedRuleSet;
  annotations: Record<RuleFieldPath, FieldAnnotation>;
  overlay: StatutoryOverlay;
  /** Anomalies the reviewer dismissed or acknowledged, by index. */
  anomalyAcks: Record<number, { note: string; by: string; at: string }>;
};

export function annotate(extracted: ExtractedRuleSet, pageTexts: string[], state: string, executedOn: string): StoredRules {
  ExtractedRuleSetSchema.parse(extracted);
  const governing = extracted.governing_law_state.value ?? state;
  const overlay = overlayFor(governing, executedOn);
  const annotations = {} as Record<RuleFieldPath, FieldAnnotation>;
  for (const path of RULE_FIELDS) {
    const f = getField(extracted, path);
    const verification: Verification = f.evidence
      ? verifyQuote(pageTexts, f.evidence.quote, f.evidence.page)
      : { status: "none", page: null, score: null };
    const reasons: string[] = [];
    let state: Review["state"] = "auto_accepted";
    const escalate = (r: string) => {
      state = "escalated";
      reasons.push(r);
    };
    const flag = (r: string) => {
      if (state !== "escalated") state = "needs_review";
      reasons.push(r);
    };

    if (f.not_found) {
      if (REQUIRED_FIELDS.includes(path)) escalate("Required field not found in the contract.");
      else reasons.push("Not found in the contract; the engine treats it as absent.");
    } else {
      if (!f.evidence) escalate("Value proposed without a supporting quote.");
      else {
        if (verification.status === "unverified") escalate("Quoted text could not be found in the PDF.");
        else if (verification.status === "fuzzy" && (verification.score ?? 0) < 0.95) flag(`Quote matched approximately (${Math.round((verification.score ?? 0) * 100)}%).`);
        if (f.evidence.confidence === "low") escalate("Low confidence.");
        else if (f.evidence.confidence === "medium") flag("Medium confidence.");
      }
    }
    for (const a of extracted.anomalies) if (a.field === path) flag(`Anomaly: ${a.description}`);

    // Statutory conflicts the reviewer must acknowledge.
    if (path === "timing.type" && f.value === "pay_if_paid" && overlay.payIfPaidVoid) {
      escalate("Pay-if-paid is unenforceable in this state; the engine will apply pay-when-paid and the statutory clock.");
    }
    if (path === "retainage.percent_bps" && typeof f.value === "number" && overlay.retentionCapBps !== null && f.value > overlay.retentionCapBps) {
      escalate(`Exceeds the statutory retention cap of ${overlay.retentionCapBps / 100}%; the engine withholds at the cap.`);
    }
    if (path === "timing.type" && f.value === "pay_if_paid" && (overlay.payIfPaid === "limited" || overlay.payIfPaid === "unsettled")) {
      flag(`Pay-if-paid is ${overlay.payIfPaid} in ${overlay.state}; confirm the clause can be relied on.`);
    }
    if (path === "timing.days" && typeof f.value === "number" && overlay.progressPaymentOverridable === false && overlay.progressPaymentDaysDefault !== null && overlay.dayType !== "business" && f.value > overlay.progressPaymentDaysDefault) {
      flag(`${overlay.state} law requires payment within ${overlay.progressPaymentDaysDefault} days and the contract cannot lengthen that; the engine uses the statutory deadline.`);
    }
    annotations[path] = { verification, review: { state, reasons, override: null } };
  }
  return { extracted, annotations, overlay, anomalyAcks: {} };
}

export function blockingFields(stored: StoredRules): RuleFieldPath[] {
  return RULE_FIELDS.filter((p) => {
    const s = stored.annotations[p].review.state;
    return s === "escalated" || s === "needs_review";
  });
}

export function unacknowledgedAnomalies(stored: StoredRules): number[] {
  return stored.extracted.anomalies.map((_, i) => i).filter((i) => !stored.anomalyAcks[i]);
}

/** Values the engine runs on: extracted values with reviewer overrides applied. */
export function effectiveValues(stored: StoredRules): RuleValues {
  const values = toValues(stored.extracted);
  for (const path of RULE_FIELDS) {
    const o = stored.annotations[path].review.override;
    if (!o) continue;
    const parts = path.split(".");
    let cur: Record<string, unknown> = values as unknown as Record<string, unknown>;
    for (const p of parts.slice(0, -1)) cur = cur[p] as Record<string, unknown>;
    cur[parts[parts.length - 1]] = o.value;
  }
  return values;
}

export function approvedHash(stored: StoredRules): string {
  const canonical = JSON.stringify({ values: effectiveValues(stored), overlay: stored.overlay });
  return createHash("sha256").update(canonical).digest("hex");
}

export function fieldLabel(path: RuleFieldPath): string {
  const labels: Record<RuleFieldPath, string> = {
    "parties.contractor": "Contractor",
    "parties.subcontractor": "Subcontractor",
    "parties.owner": "Owner",
    "parties.project": "Project",
    governing_law_state: "Governing law",
    "timing.type": "Payment timing",
    "timing.days": "Days to pay after the owner pays",
    "timing.agreed_in_writing": "Payment period agreed in writing",
    "retainage.percent_bps": "Retainage rate",
    "retainage.cap_bps": "Retainage cap",
    "retainage.reduction_trigger": "When retainage is reduced",
    "retainage.release_condition": "Retainage release condition",
    "retainage.release_days": "Days to release retainage",
    "waivers.conditional_before_progress": "Conditional waiver before progress payment",
    "waivers.unconditional_after_payment": "Unconditional waiver after payment",
    "waivers.lower_tier_required": "Waivers required from suppliers and sub-subcontractors",
    "waivers.statutory_form_required": "Statutory waiver forms required",
    "offsets.joint_check": "Joint checks allowed",
    "offsets.backcharge_setoff": "Backcharges may be deducted",
    "offsets.withhold_defective": "Payment may be withheld for defective work",
    stored_materials: "Stored materials can be billed",
  };
  return labels[path];
}
