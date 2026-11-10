/**
 * Compile: Claude reads the subcontract PDF and proposes a typed rule set with verbatim evidence.
 * Our code verifies every quote afterwards (src/server/rules/review.ts); nothing here is trusted.
 *
 * The model fills a flat "wire" schema: one entry per rule field, with the value as text. The
 * structured-output API rejects the domain schema as written (21 fields, each with a nullable value
 * and nullable evidence, is 43 union-typed parameters against a limit of 16, and nesting 21 typed
 * objects compiles to too large a grammar). `fromWire` parses each entry into the typed, nullable
 * domain shape and rejects anything that does not parse.
 */
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { anthropic, MODEL } from "./client";
import { Confidence, RULE_FIELDS, StrictRuleSetSchema, TimingType, type ExtractedRuleSet, type RuleField, type RuleFieldPath } from "@/domain/rules/schema";

export const PROMPT_VERSION = "extract-v2";

export const WireRuleSetSchema = z.object({
  fields: z.array(
    z.object({
      path: z.enum(RULE_FIELDS),
      /** False when the contract is silent on this field. */
      found: z.boolean(),
      /** The value as text: a number, "true"/"false", a timing type, or the words themselves. "" when not found. */
      value: z.string(),
      /** Verbatim quote supporting the value; "" when not found. */
      quote: z.string(),
      /** 1-based page of the quote; 0 when not found. */
      page: z.number(),
      confidence: Confidence,
      rationale: z.string(),
    }),
  ),
  anomalies: z.array(
    z.object({
      /** Dotted path of the field this concerns, e.g. "retainage.release_condition", or "general". */
      field: z.string(),
      description: z.string(),
      /** Verbatim quote, or "" when the anomaly is an absence. */
      quote: z.string(),
      /** 1-based page of the quote, or 0. */
      page: z.number(),
    }),
  ),
});
export type WireRuleSet = z.infer<typeof WireRuleSetSchema>;

const NUMBER_FIELDS: RuleFieldPath[] = ["timing.days", "retainage.percent_bps", "retainage.cap_bps", "retainage.release_days"];
const BOOLEAN_FIELDS: RuleFieldPath[] = [
  "timing.agreed_in_writing",
  "waivers.conditional_before_progress",
  "waivers.unconditional_after_payment",
  "waivers.lower_tier_required",
  "waivers.statutory_form_required",
  "offsets.joint_check",
  "offsets.backcharge_setoff",
  "offsets.withhold_defective",
  "stored_materials",
];

function parseValue(path: RuleFieldPath, raw: string): unknown {
  const v = raw.trim();
  if (NUMBER_FIELDS.includes(path)) {
    const n = Number(v.replace(/,/g, ""));
    if (!Number.isFinite(n)) throw new Error(`${path}: "${raw}" is not a number`);
    return n;
  }
  if (BOOLEAN_FIELDS.includes(path)) {
    if (/^(true|yes)$/i.test(v)) return true;
    if (/^(false|no)$/i.test(v)) return false;
    throw new Error(`${path}: "${raw}" is not true or false`);
  }
  if (path === "timing.type") return TimingType.parse(v);
  if (path === "governing_law_state") return v.toUpperCase();
  return v;
}

/** Wire entries → the typed, nullable domain shape. A field the model left out is "not found". */
export function fromWire(w: WireRuleSet): ExtractedRuleSet {
  const out: Record<string, unknown> = {};
  for (const path of RULE_FIELDS) {
    const e = w.fields.find((f) => f.path === path);
    let f: RuleField;
    if (!e || !e.found || (path === "timing.type" && e.value.trim() === "silent" && !e.quote.trim())) {
      f = { value: null, evidence: null, not_found: true };
    } else {
      // A value with no quote keeps evidence null, which the review policy escalates.
      const evidence = e.quote.trim() ? { quote: e.quote, page: e.page, confidence: e.confidence, rationale: e.rationale } : null;
      f = { value: parseValue(path, e.value), evidence, not_found: false };
    }
    const parts = path.split(".");
    if (parts.length === 1) out[path] = f;
    else ((out[parts[0]] ??= {}) as Record<string, unknown>)[parts[1]] = f;
  }
  out.anomalies = w.anomalies.map((a) => ({
    field: a.field,
    description: a.description,
    evidence: a.quote.trim() ? { quote: a.quote, page: a.page, confidence: "high" as const, rationale: a.description } : null,
  }));
  return out as ExtractedRuleSet;
}

const SYSTEM = `You are a construction payment analyst. You read one subcontract between a general contractor ("Contractor") and a subcontractor and compile its payment terms into a typed rule set.

Hard rules:
1. Every value you report must be supported by a verbatim quote from the contract: contiguous text copied exactly as written, at most 300 characters, no ellipses, no paraphrase, with the 1-based page number where it appears. Our software checks each quote against the PDF; an unverifiable quote is treated as a failure.
2. Return exactly one entry for each of the 21 field paths. Write the value as text: digits for numbers ("7", "1000"), "true" or "false" for yes/no fields, one of pay_when_paid / pay_if_paid / fixed_days / silent for timing.type, the two-letter code for governing_law_state, and the contract's own words for the rest. If the contract is silent on a field, set found to false with value "", quote "", page 0, confidence "high" and rationale "Not stated." Never infer a value from industry custom, statute or other contracts. When found is true, value, quote and page must all be real.
3. Confidence: "high" when the clause states the value plainly; "medium" when it requires interpretation or combining clauses; "low" when the clause is ambiguous, discretionary, or conflicts with another clause.
4. Report anomalies: anything a controller should look at before relying on the rules. Examples: owner payment made a condition precedent to any payment (pay-if-paid), discretionary release triggers ("to Contractor's satisfaction"), retention rates that change, conflicts between clauses, unusual setoff rights. Attach the field path it concerns and a verbatim quote with its page (quote "" and page 0 only when the anomaly is something missing).
5. Do not apply law. Do not say whether a clause is enforceable. Report what the document says.

Field glossary:
- timing.type: pay_when_paid = subcontractor is paid a stated number of days after the contractor receives the owner's payment, but the obligation to pay is not conditioned on it; pay_if_paid = the contractor's receipt of owner payment is an express condition precedent to its obligation to pay, or the subcontractor assumes the risk of owner non-payment; fixed_days = paid a number of days after the application or invoice regardless of the owner; silent = no timing clause (found false).
- timing.days: the number of days stated in that clause. timing.agreed_in_writing: true when a specific period is written in the contract.
- retainage.percent_bps: percent of each progress payment withheld, as basis points (10% = 1000, 5% = 500). retainage.cap_bps: a maximum total retention as basis points of the subcontract sum, if any. retainage.reduction_trigger: when the rate steps down. retainage.release_condition: what must happen for retention to be released, in the contract's words. retainage.release_days: days after that trigger (often after the contractor receives retention from the owner).
- waivers.conditional_before_progress: a conditional waiver/release is required with each progress application. waivers.unconditional_after_payment: an unconditional waiver/release is required for prior payments. waivers.lower_tier_required: releases from sub-subcontractors and suppliers are required. waivers.statutory_form_required: the contract requires the state's statutory waiver forms (for California, Civil Code sections 8132, 8134, 8136, 8138).
- offsets.joint_check: the contractor may pay by joint check. offsets.backcharge_setoff: the contractor may deduct backcharges or set off amounts owed. offsets.withhold_defective: the contractor may withhold payment for defective work or claims.
- stored_materials: found true with value true if the contract allows payment for stored materials (on or off site), value false if it says they are not payable; found false if silent.
- governing_law_state: two-letter US state code from the governing-law clause.`;

const INSTRUCTION = `Compile this subcontract into the rule set. Quote verbatim. Mark silent fields found: false. List anomalies.`;

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
    max_tokens: 16_000,
    system: SYSTEM,
    output_config: { effort: "high", format: zodOutputFormat(WireRuleSetSchema) },
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
  if (res.stop_reason === "max_tokens") throw new Error("The extraction was cut off before it finished; the document may be too long.");
  if (!res.parsed_output) throw new Error(`No structured output (stop_reason ${res.stop_reason}).`);
  const strict = StrictRuleSetSchema.safeParse(fromWire(res.parsed_output));
  if (!strict.success) throw new Error(`Extraction failed range checks: ${strict.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
  return { extracted: strict.data, model: res.model, promptVersion: PROMPT_VERSION, ms: Date.now() - t0, usage: res.usage };
}
