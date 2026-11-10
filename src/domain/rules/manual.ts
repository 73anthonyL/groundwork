/**
 * A rule set typed in by the payer instead of compiled from a document. Used one hop down, where a
 * subcontractor records the terms of a purchase order or sub-subcontract. There is no quote to verify,
 * so every stated field is marked as entered by a person and nothing is claimed about a document.
 */
import type { ExtractedRuleSet, RuleField, TimingType } from "./schema";

export type ManualTerms = {
  payer: string;
  payee: string;
  owner: string | null;
  project: string | null;
  state: string;
  timingType: TimingType;
  timingDays: number | null;
  retainageBps: number;
};

export function manualRuleSet(t: ManualTerms): ExtractedRuleSet {
  const stated = <T>(value: T): RuleField<T> => ({ value, evidence: null, not_found: false });
  const silent = <T>(): RuleField<T> => ({ value: null, evidence: null, not_found: true });
  const opt = <T>(value: T | null): RuleField<T> => (value === null ? silent<T>() : stated(value));
  return {
    parties: { contractor: stated(t.payer), subcontractor: stated(t.payee), owner: opt(t.owner), project: opt(t.project) },
    governing_law_state: stated(t.state),
    timing: { type: stated(t.timingType), days: opt(t.timingDays), agreed_in_writing: stated(t.timingDays !== null) },
    retainage: { percent_bps: stated(t.retainageBps), cap_bps: silent(), reduction_trigger: silent(), release_condition: silent(), release_days: silent() },
    waivers: { conditional_before_progress: stated(true), unconditional_after_payment: stated(true), lower_tier_required: silent(), statutory_form_required: silent() },
    offsets: { joint_check: silent(), backcharge_setoff: silent(), withhold_defective: silent() },
    stored_materials: silent(),
    anomalies: [],
  } as ExtractedRuleSet;
}
