/**
 * The approved payment rules of a subcontract in the subcontractor's words: when I get paid, how
 * much is held, what I must sign, what can be deducted. Each statement carries the clause it came
 * from when the contract states one and the reviewer did not override it, so the page can set the
 * contract's own words beside ours.
 */
import type { RuleFieldPath } from "@/domain/rules/schema";
import { effectiveValues, type StoredRules } from "@/server/rules/review";
import { formatBps } from "@/lib/money";

export type RuleLine = { text: string; quote?: { text: string; page: number } };
export type RuleGroup = { id: string; heading: string; lines: RuleLine[] };

export function plainRules(stored: StoredRules, payer: string): RuleGroup[] {
  const v = effectiveValues(stored);
  const quote = (path: RuleFieldPath): RuleLine["quote"] => {
    const field = path.split(".").reduce<unknown>((cur, p) => (cur as Record<string, unknown> | undefined)?.[p], stored.extracted) as { not_found?: boolean; evidence?: { quote: string; page: number } | null } | undefined;
    if (!field || field.not_found || !field.evidence?.quote || stored.annotations[path]?.review.override) return undefined;
    return { text: field.evidence.quote, page: field.evidence.page };
  };
  const days = (n: number) => `${n} day${n === 1 ? "" : "s"}`;

  const timing: RuleLine[] = [];
  const d = v.timing.days;
  const tq = quote("timing.days") ?? quote("timing.type");
  switch (v.timing.type) {
    case "pay_when_paid":
      timing.push({ text: d !== null ? `Within ${days(d)} after ${payer} receives the owner's payment for your work.` : `After ${payer} receives the owner's payment for your work. The contract names no number of days, so state law sets the deadline.`, quote: tq });
      break;
    case "pay_if_paid":
      timing.push({ text: `Only once the owner has paid ${payer} for your work${d !== null ? `, then within ${days(d)}` : ""}.`, quote: tq });
      break;
    case "fixed_days":
      timing.push({ text: d !== null ? `Within ${days(d)} of an approved pay app, whether or not the owner has paid ${payer}.` : "On a fixed schedule after an approved pay app.", quote: tq });
      break;
    default:
      timing.push({ text: "Your contract sets no payment deadline, so state law sets it." });
  }
  timing.push({ text: "State law can shorten this. Each payment shows the exact date it is due." });

  const held: RuleLine[] = [];
  const bps = v.retainage.percent_bps;
  if (bps === null || bps === 0) held.push({ text: "Nothing is held back: your contract states no retainage." });
  else {
    held.push({ text: `${formatBps(bps)} of each payment is held back as retainage.`, quote: quote("retainage.percent_bps") });
    if (v.retainage.cap_bps !== null) held.push({ text: `The total held never passes ${formatBps(v.retainage.cap_bps)} of the contract sum.`, quote: quote("retainage.cap_bps") });
    if (v.retainage.reduction_trigger) held.push({ text: `It goes down: ${v.retainage.reduction_trigger}`, quote: quote("retainage.reduction_trigger") });
    if (v.retainage.release_condition || v.retainage.release_days !== null)
      held.push({
        text: `It is released${v.retainage.release_days !== null ? ` within ${days(v.retainage.release_days)}` : ""}${v.retainage.release_condition ? `: ${v.retainage.release_condition}` : "."}`,
        quote: quote("retainage.release_condition") ?? quote("retainage.release_days"),
      });
  }

  const sign: RuleLine[] = [];
  if (v.waivers.conditional_before_progress) sign.push({ text: "A conditional waiver before each progress payment. It takes effect only when the money reaches you.", quote: quote("waivers.conditional_before_progress") });
  if (v.waivers.unconditional_after_payment) sign.push({ text: "An unconditional waiver after each payment lands, confirming you were paid.", quote: quote("waivers.unconditional_after_payment") });
  if (v.waivers.lower_tier_required) sign.push({ text: "Waivers from your own suppliers and sub-subcontractors. Groundwork sends them a link to sign.", quote: quote("waivers.lower_tier_required") });
  if (v.waivers.statutory_form_required) sign.push({ text: "The waivers use your state's statutory forms.", quote: quote("waivers.statutory_form_required") });
  if (!sign.length) sign.push({ text: "Your contract does not ask for lien waivers." });

  const deduct: RuleLine[] = [];
  if (v.offsets.backcharge_setoff) deduct.push({ text: `${payer} may deduct backcharges from a payment.`, quote: quote("offsets.backcharge_setoff") });
  if (v.offsets.withhold_defective) deduct.push({ text: `${payer} may withhold payment for defective work.`, quote: quote("offsets.withhold_defective") });
  if (v.offsets.joint_check) deduct.push({ text: `${payer} may pay by joint check to you and your supplier.`, quote: quote("offsets.joint_check") });
  if (!deduct.length) deduct.push({ text: "Your contract gives no right to deduct from your payments." });

  const stored_ = v.stored_materials;
  const materials: RuleLine[] = [
    stored_ === true
      ? { text: "You can bill for materials stored on site before they are installed.", quote: quote("stored_materials") }
      : stored_ === false
        ? { text: "You cannot bill for materials until they are installed.", quote: quote("stored_materials") }
        : { text: "Your contract does not say whether stored materials can be billed." },
  ];

  return [
    { id: "timing", heading: "When you are paid", lines: timing },
    { id: "retainage", heading: "What is held back", lines: held },
    { id: "waivers", heading: "What you sign", lines: sign },
    { id: "offsets", heading: "What can be deducted", lines: deduct },
    { id: "materials", heading: "Stored materials", lines: materials },
  ];
}
