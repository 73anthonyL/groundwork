import type { RuleFieldPath } from "./schema";

const TIMING: Record<string, string> = {
  pay_when_paid: "Pay-when-paid",
  pay_if_paid: "Pay-if-paid",
  fixed_days: "A fixed number of days",
  silent: "Not stated",
};

/** Human rendering of a rule value for the review screen. */
export function formatRuleValue(path: RuleFieldPath, value: unknown): string {
  if (value === null || value === undefined) return "—";
  switch (path) {
    case "timing.type":
      return TIMING[String(value)] ?? String(value);
    case "timing.days":
    case "retainage.release_days":
      return `${value} days`;
    case "retainage.percent_bps":
    case "retainage.cap_bps": {
      const pct = Number(value) / 100;
      return `${Number.isInteger(pct) ? pct : pct.toFixed(2)}%`;
    }
    case "timing.agreed_in_writing":
    case "waivers.conditional_before_progress":
    case "waivers.unconditional_after_payment":
    case "waivers.lower_tier_required":
    case "waivers.statutory_form_required":
    case "offsets.joint_check":
    case "offsets.backcharge_setoff":
    case "offsets.withhold_defective":
    case "stored_materials":
      return value ? "Yes" : "No";
    default:
      return String(value);
  }
}

export const FIELD_GROUPS: { title: string; paths: RuleFieldPath[] }[] = [
  { title: "Parties", paths: ["parties.contractor", "parties.subcontractor", "parties.owner", "parties.project"] },
  { title: "Governing law", paths: ["governing_law_state"] },
  { title: "Payment timing", paths: ["timing.type", "timing.days", "timing.agreed_in_writing"] },
  { title: "Retainage", paths: ["retainage.percent_bps", "retainage.cap_bps", "retainage.reduction_trigger", "retainage.release_condition", "retainage.release_days"] },
  { title: "Lien waivers", paths: ["waivers.conditional_before_progress", "waivers.unconditional_after_payment", "waivers.lower_tier_required", "waivers.statutory_form_required"] },
  { title: "Deductions and joint checks", paths: ["offsets.joint_check", "offsets.backcharge_setoff", "offsets.withhold_defective"] },
  { title: "Stored materials", paths: ["stored_materials"] },
];

/** Engine-relevant fields get a short id the UI and flags can cite ("R-3"). */
export const RULE_IDS: Partial<Record<RuleFieldPath, string>> = {
  "timing.type": "R-1",
  "timing.days": "R-2",
  "retainage.percent_bps": "R-3",
  "retainage.cap_bps": "R-4",
  "retainage.release_condition": "R-5",
  "retainage.release_days": "R-6",
  "waivers.conditional_before_progress": "R-7",
  "waivers.unconditional_after_payment": "R-8",
  "offsets.backcharge_setoff": "R-9",
  stored_materials: "R-10",
};
