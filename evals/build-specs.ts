/**
 * Builds evals/specs/*.json: the answer keys (and drafting briefs) for the synthetic eval suite.
 *   pnpm eval:specs        then  pnpm gen:contracts evals/specs/*.json  (needs ANTHROPIC_API_KEY)
 *
 * Each case is a base contract plus one deliberate twist. "clean" cases vary values and phrasing;
 * "adversarial" cases target a specific way an extractor fails: the decisive clause buried away from
 * its article, overridden by a rider or amendment, stated only in an exhibit, a near-miss phrasing
 * that looks like a different rule, distractor numbers, or a term the contract never states (to
 * catch values inferred from industry norms). The `brief` tells the drafter exactly where and how to
 * place the twist; the spec's `expected` is what a careful human reading the whole contract concludes.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { RuleValues } from "../src/domain/rules/schema";

type Case = {
  slug: string;
  category: "clean" | "adversarial";
  twist: string;
  brief: string;
  expected: (base: RuleValues) => RuleValues;
  anomalies?: string[];
  executedOn?: string;
};

const PARTIES = [
  ["Harbor Point Construction, Inc.", "Delta Mechanical Systems, LLC", "Sacramento Unified School District", "Rosemont Elementary Modernization"],
  ["Calder & Webb Builders", "Brightline Glazing Co.", "Fresno Community Health Partners", "Kings Canyon Medical Office Building"],
  ["Sierra Crest General Contractors, Inc.", "Granite State Concrete, Inc.", "Pasadena Arts Foundation", "Colorado Boulevard Gallery Expansion"],
  ["Northgate Builders Group", "Allied Fire Protection, Inc.", "Coastal Logistics REIT", "Port of Stockton Warehouse 7"],
  ["Redwood Peak Construction Co.", "Precision Roofing & Sheet Metal", "City of Santa Rosa", "Fire Station 5 Replacement"],
  ["Mesa Verde Contractors, Inc.", "Lumen Electric Corp.", "Ventura County Credit Union", "Oxnard Branch Remodel"],
];

function base(i: number): RuleValues {
  const [contractor, subcontractor, owner, project] = PARTIES[i % PARTIES.length];
  return {
    parties: { contractor, subcontractor, owner, project },
    governing_law_state: "CA",
    timing: { type: "pay_when_paid", days: 7, agreed_in_writing: true },
    retainage: { percent_bps: 500, cap_bps: null, reduction_trigger: null, release_condition: "Final Completion of the Subcontract Work and Contractor's receipt of retention from Owner", release_days: 10 },
    waivers: { conditional_before_progress: true, unconditional_after_payment: true, lower_tier_required: true, statutory_form_required: true },
    offsets: { joint_check: null, backcharge_setoff: true, withhold_defective: true },
    stored_materials: false,
  };
}

const set = <K extends keyof RuleValues>(b: RuleValues, k: K, v: Partial<RuleValues[K]> | RuleValues[K]): RuleValues =>
  ({ ...b, [k]: typeof v === "object" && v !== null && !Array.isArray(v) ? { ...(b[k] as object), ...v } : v }) as RuleValues;

const CASES: Case[] = [
  // ── clean: values and phrasing vary, nothing hidden ─────────────────────
  { slug: "clean-pwp-7-ret5", category: "clean", twist: "baseline", brief: "Straightforward form. State every term plainly in its natural article.", expected: (b) => b },
  { slug: "clean-pwp-10-ret10", category: "clean", twist: "10-day period, 10% retention (pre-2026 contract)", executedOn: "2025-06-02", brief: "Contract dated June 2, 2025. Payment within ten (10) days after Contractor receives payment from Owner. Retention 10%.", expected: (b) => set(set(b, "timing", { days: 10 }), "retainage", { percent_bps: 1000 }) },
  { slug: "clean-fixed-30", category: "clean", twist: "fixed 30 days from application, independent of owner payment", brief: "Contractor pays within thirty (30) days after receipt of an approved application regardless of whether Owner has paid Contractor. Do not link payment to Owner payment anywhere.", expected: (b) => set(b, "timing", { type: "fixed_days", days: 30 }) },
  { slug: "clean-joint-check", category: "clean", twist: "joint checks expressly permitted; stored materials payable", brief: "Include an express joint-check clause allowing Contractor to issue checks jointly payable to Subcontractor and its suppliers. Stored materials are payable if stored in a bonded, insured warehouse with title passing to Owner.", expected: (b) => set(set(b, "offsets", { joint_check: true }), "stored_materials", true) },
  { slug: "clean-no-lower-tier", category: "clean", twist: "only the sub's own waivers; no lower-tier waivers", brief: "Require the Subcontractor's own conditional and unconditional statutory waivers, and say nothing at all about waivers from sub-subcontractors or suppliers.", expected: (b) => set(b, "waivers", { lower_tier_required: null }) },
  { slug: "clean-nevada-law", category: "clean", twist: "Nevada governing law on a Nevada project", brief: "Project in Reno, Nevada; the contract is governed by Nevada law. Waivers in the forms prescribed by NRS 108.2457 (so not California statutory forms). Pay within 10 days after Contractor receives payment.", expected: (b) => set(set(set(b, "governing_law_state", "NV"), "timing", { days: 10 }), "parties", { owner: "Washoe County School District", project: "Sparks Middle School Gymnasium Addition" })},

  // ── adversarial ─────────────────────────────────────────────────────────
  { slug: "adv-pif-buried-in-definitions", category: "adversarial", twist: "pay-if-paid stated only in the Definitions article", brief: "In Article 1 (Definitions), define 'Owner Payment Condition' as: Contractor's actual receipt of payment from Owner is an express condition precedent to any payment obligation, and Subcontractor assumes the risk of Owner nonpayment. The payment article must only say payment is due 7 days after the Owner Payment Condition is satisfied, without restating the risk shift.", expected: (b) => set(b, "timing", { type: "pay_if_paid" }), anomalies: ["Pay-if-paid risk shift appears only in the definition of 'Owner Payment Condition'."] },
  { slug: "adv-pwp-looks-like-pif", category: "adversarial", twist: "uses the word 'condition' but expressly is NOT a condition precedent", brief: "The payment clause says payment is due within 7 days after Contractor receives payment from Owner, and then expressly states that receipt of Owner payment is a timing mechanism only, not a condition precedent, and that Contractor remains liable to pay within a reasonable time even if Owner never pays.", expected: (b) => b },
  { slug: "adv-pif-without-magic-words", category: "adversarial", twist: "risk shift without the phrase 'condition precedent'", brief: "Never use the words 'condition precedent'. Instead: Subcontractor agrees that it shall be paid only out of funds actually received by Contractor from Owner for Subcontractor's work, and that Subcontractor bears the entire risk that Owner fails to pay for any reason including insolvency.", expected: (b) => set(b, "timing", { type: "pay_if_paid" }), anomalies: ["Risk of Owner nonpayment shifted to Subcontractor (pay-if-paid) without the words 'condition precedent'."] },
  { slug: "adv-rider-overrides-retention", category: "adversarial", twist: "body says 10%, a later rider that controls says 5%", brief: "The retention article says 10%. At the end, add 'Rider A — Special Conditions' stating that in the event of conflict Rider A controls, and that retention under this Subcontract is five percent (5%).", expected: (b) => set(b, "retainage", { percent_bps: 500 }), anomalies: ["Rider A overrides the 10% retention in the body with 5%."] },
  { slug: "adv-amendment-changes-days", category: "adversarial", twist: "Amendment No. 1 changes 10 days to 7", brief: "The payment article says ten (10) days after Owner payment. After the signature block, include 'Amendment No. 1', signed by both parties, amending that period to seven (7) days.", expected: (b) => b, anomalies: ["Amendment No. 1 changes the payment period from 10 to 7 days."] },
  { slug: "adv-retention-only-in-exhibit", category: "adversarial", twist: "retention rate appears only in an exhibit table", brief: "The retention article says retention is withheld 'at the rate stated in Exhibit C' and gives no number. Add a short 'EXHIBIT C — PAYMENT TERMS' section (before the schedule of values) with a two-column table whose row 'Retention rate' reads '5%'.", expected: (b) => b },
  { slug: "adv-distractor-prime-retention", category: "adversarial", twist: "prime contract retention (5%) quoted near the sub's own 10%", executedOn: "2025-03-10", brief: "Contract dated March 10, 2025. In the recitals, mention that under the Prime Contract the Owner withholds five percent (5%) retention from Contractor. The Subcontract's own retention article sets retention at ten percent (10%).", expected: (b) => set(b, "retainage", { percent_bps: 1000 }) },
  { slug: "adv-days-in-words-only", category: "adversarial", twist: "every period written in words, no numerals", brief: "Write all day counts in words only, never digits: payment within seven calendar days after Owner payment; retention released within ten days. Retention 'five percent' in words.", expected: (b) => b },
  { slug: "adv-retention-intentionally-omitted", category: "adversarial", twist: "the retention section is struck; no retention", brief: "Include a section heading for retention with the text '[Intentionally Omitted.]' and do not mention retention, retainage or holdback anywhere else.", expected: (b) => set(b, "retainage", { percent_bps: null, cap_bps: null, reduction_trigger: null, release_condition: null, release_days: null }) },
  { slug: "adv-reduction-trigger", category: "adversarial", twist: "10% reducing to 5% at 50% complete", executedOn: "2025-08-01", brief: "Contract dated August 1, 2025. Retention is ten percent (10%) until the Subcontract Work is fifty percent (50%) complete as certified by the Architect, after which retention on further payments is five percent (5%).", expected: (b) => set(b, "retainage", { percent_bps: 1000, reduction_trigger: "Reduces to 5% once the Subcontract Work is 50% complete as certified by the Architect" }) },
  { slug: "adv-retention-cap", category: "adversarial", twist: "retention stops once 5% of the subcontract sum is held", executedOn: "2025-08-01", brief: "Contract dated August 1, 2025. Retention ten percent (10%) of each payment, but Contractor shall cease withholding once total retention held equals five percent (5%) of the Subcontract Sum.", expected: (b) => set(b, "retainage", { percent_bps: 1000, cap_bps: 500 }) },
  { slug: "adv-silent-timing", category: "adversarial", twist: "no payment timing clause at all", brief: "Describe applications for payment and their content, but never say when Contractor must pay. Do not mention Owner payment as a trigger, and give no number of days for progress payments.", expected: (b) => set(b, "timing", { type: "silent", days: null, agreed_in_writing: null }), anomalies: ["The contract does not say when progress payments are due."] },
  { slug: "adv-silent-waivers", category: "adversarial", twist: "no lien waiver requirements", brief: "Do not mention lien waivers, releases, or Civil Code sections 8132–8138 anywhere.", expected: (b) => set(b, "waivers", { conditional_before_progress: null, unconditional_after_payment: null, lower_tier_required: null, statutory_form_required: null }) },
  { slug: "adv-subjective-release", category: "adversarial", twist: "retention released 'to Contractor's satisfaction'", brief: "Retention is released within 10 days after 'completion of all punch list items to the satisfaction of Contractor in its sole discretion'. Do not mention Final Completion or Owner release of retention.", expected: (b) => set(b, "retainage", { release_condition: "Completion of all punch list items to the satisfaction of Contractor in its sole discretion" }), anomalies: ["Retention release turns on Contractor's subjective satisfaction."] },
  { slug: "adv-cross-reference-days", category: "adversarial", twist: "days stated by cross-reference to another section", brief: "Section 4.2 says progress payments are due 'within the Payment Period'. Section 14.6 (Miscellaneous) defines 'Payment Period' as seven (7) days after Contractor's receipt of the corresponding payment from Owner.", expected: (b) => b },
  { slug: "adv-no-backcharge", category: "adversarial", twist: "withholding for defects allowed, but no backcharge/setoff", brief: "Allow Contractor to withhold amounts for defective work not remedied, but say nothing about Contractor performing work itself and deducting the cost, and nothing about setoff or backcharges.", expected: (b) => set(b, "offsets", { backcharge_setoff: null }) },
  { slug: "adv-stored-materials-conditional", category: "adversarial", twist: "stored materials payable only with prior written approval", brief: "Materials stored off site are payable only with Contractor's prior written approval, proof of insurance, and a bill of sale transferring title.", expected: (b) => set(b, "stored_materials", true) },
  { slug: "adv-long-boilerplate", category: "adversarial", twist: "decisive terms deep inside 5,000 words of boilerplate", brief: "Make the contract long (about 5,000 words) with extensive insurance, indemnity, safety, and dispute-resolution articles. Put the payment and retention article near the end, after the insurance article.", expected: (b) => b },
];

const outDir = path.resolve("evals/specs");
mkdirSync(outDir, { recursive: true });
CASES.forEach((c, i) => {
  const expected = c.expected(base(i));
  const spec = {
    slug: c.slug,
    contractKey: c.slug,
    file: `${c.slug}.pdf`,
    category: c.category,
    executedOn: c.executedOn ?? "2026-02-02",
    notes: `${c.twist}.`,
    brief: c.brief,
    expected,
    anchors: {},
    anomalies: (c.anomalies ?? []).map((description) => ({ field: "general", description, anchor: null })),
  };
  writeFileSync(path.join(outDir, `${c.slug}.json`), JSON.stringify(spec, null, 2) + "\n");
});
console.log(`wrote ${CASES.length} specs to ${path.relative(process.cwd(), outDir)}`);
