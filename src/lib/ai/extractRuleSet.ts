/**
 * Compile: Claude reads the subcontract PDF and proposes a typed rule set with verbatim evidence.
 * Our code verifies every quote afterwards (src/server/rules/review.ts); nothing here is trusted.
 */
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { anthropic, MODEL } from "./client";
import { ExtractedRuleSetSchema, StrictRuleSetSchema, type ExtractedRuleSet } from "@/domain/rules/schema";

export const PROMPT_VERSION = "extract-v1";

const SYSTEM = `You are a construction payment analyst. You read one subcontract between a general contractor ("Contractor") and a subcontractor and compile its payment terms into a typed rule set.

Hard rules:
1. Every value you report must be supported by a verbatim quote from the contract: contiguous text copied exactly as written, at most 300 characters, no ellipses, no paraphrase, with the 1-based page number where it appears. Our software checks each quote against the PDF; an unverifiable quote is treated as a failure.
2. If the contract is silent on a field, set value to null, evidence to null and not_found to true. Never infer a value from industry custom, statute or other contracts.
3. Confidence: "high" when the clause states the value plainly; "medium" when it requires interpretation or combining clauses; "low" when the clause is ambiguous, discretionary, or conflicts with another clause.
4. Report anomalies: anything a controller should look at before relying on the rules. Examples: owner payment made a condition precedent to any payment (pay-if-paid), discretionary release triggers ("to Contractor's satisfaction"), retention rates that change, conflicts between clauses, unusual setoff rights. Attach the field path it concerns.
5. Do not apply law. Do not say whether a clause is enforceable. Report what the document says.

Field glossary:
- timing.type: pay_when_paid = subcontractor is paid a stated number of days after the contractor receives the owner's payment, but the obligation to pay is not conditioned on it; pay_if_paid = the contractor's receipt of owner payment is an express condition precedent to its obligation to pay, or the subcontractor assumes the risk of owner non-payment; fixed_days = paid a number of days after the application or invoice regardless of the owner; silent = no timing clause.
- timing.days: the number of days stated in that clause. timing.agreed_in_writing: true when a specific period is written in the contract.
- retainage.percent_bps: percent of each progress payment withheld, as basis points (10% = 1000, 5% = 500). retainage.cap_bps: a maximum total retention as basis points of the subcontract sum, if any. retainage.reduction_trigger: when the rate steps down. retainage.release_condition: what must happen for retention to be released, in the contract's words. retainage.release_days: days after that trigger (often after the contractor receives retention from the owner).
- waivers.conditional_before_progress: a conditional waiver/release is required with each progress application. waivers.unconditional_after_payment: an unconditional waiver/release is required for prior payments. waivers.lower_tier_required: releases from sub-subcontractors and suppliers are required. waivers.statutory_form_required: the contract requires the state's statutory waiver forms (for California, Civil Code sections 8132, 8134, 8136, 8138).
- offsets.joint_check: the contractor may pay by joint check. offsets.backcharge_setoff: the contractor may deduct backcharges or set off amounts owed. offsets.withhold_defective: the contractor may withhold payment for defective work or claims.
- stored_materials: true if the contract allows payment for stored materials (on or off site), false if it says they are not payable, null if silent.
- governing_law_state: two-letter US state code from the governing-law clause.`;

const INSTRUCTION = `Compile this subcontract into the rule set. Quote verbatim. Mark silent fields not_found. List anomalies.`;

export async function extractRuleSet(pdfBytes: Uint8Array): Promise<{
  extracted: ExtractedRuleSet;
  model: string;
  promptVersion: string;
  ms: number;
  usage: unknown;
}> {
  const client = anthropic();
  const t0 = Date.now();
  const res = await client.messages.parse({
    model: MODEL,
    max_tokens: 12_000,
    system: SYSTEM,
    output_config: { effort: "high", format: zodOutputFormat(ExtractedRuleSetSchema) },
    messages: [
      {
        role: "user",
        content: [
          { type: "document", source: { type: "base64", media_type: "application/pdf", data: Buffer.from(pdfBytes).toString("base64") } },
          { type: "text", text: INSTRUCTION },
        ],
      },
    ],
  });
  if (res.stop_reason === "refusal") throw new Error("The model declined to process this document.");
  if (!res.parsed_output) throw new Error(`No structured output (stop_reason ${res.stop_reason}).`);
  const strict = StrictRuleSetSchema.safeParse(res.parsed_output);
  if (!strict.success) throw new Error(`Extraction failed range checks: ${strict.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
  return { extracted: strict.data, model: res.model, promptVersion: PROMPT_VERSION, ms: Date.now() - t0, usage: res.usage };
}
