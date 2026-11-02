/**
 * "Explain this payment": Claude narrates the engine's basis for a subcontractor, in plain English.
 * The facts (amounts, rule quotes, statutes) are supplied; the model only phrases them.
 * Without an API key, a deterministic narration is produced from the same facts.
 */
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { anthropic, hasApiKey, MODEL } from "./client";
import { STATUTES, type StatuteId } from "@/domain/statutes/ca";
import { formatCents } from "@/lib/money";

export type ExplainInput = {
  subName: string;
  gcName: string;
  ownerName: string;
  ownerPaymentCents: number;
  ownerReference: string;
  payAppNumber: number;
  math: { label: string; cents: number }[];
  statutes: StatuteId[];
  notes: string[];
  /** Rule quotes the engine relied on: label → verbatim clause. */
  quotes: { label: string; quote: string; page: number }[];
  payByIso: string | null;
  status: string;
};

const Out = z.object({ explanation: z.string(), nextStep: z.string() });

export function deterministicExplanation(i: ExplainInput): { explanation: string; nextStep: string; model: string } {
  const gross = i.math.find((m) => m.label.startsWith("gross"))?.cents ?? 0;
  const ret = i.math.find((m) => m.label.startsWith("retainage withheld"))?.cents ?? 0;
  const rel = i.math.find((m) => m.label.startsWith("release"))?.cents ?? 0;
  const awaiting = i.math.find((m) => m.label.startsWith("awaiting"))?.cents ?? 0;
  const parts = [
    `${i.ownerName} paid ${i.gcName} ${formatCents(i.ownerPaymentCents)} (${i.ownerReference}).`,
    `${formatCents(gross)} of that covers your pay application #${i.payAppNumber}.`,
    ret ? `Your subcontract lets ${i.gcName} hold ${formatCents(-ret)} as retainage, so ${formatCents(rel)} is released to you.` : `Nothing is withheld, so ${formatCents(rel)} is released to you.`,
    awaiting ? `${formatCents(awaiting)} is still with the owner and will follow when the owner pays the rest.` : "",
    ...i.statutes.map((s) => `${STATUTES[s].cite}: ${STATUTES[s].summary}`),
  ].filter(Boolean);
  const next =
    i.status === "awaiting_waiver"
      ? "Sign the conditional waiver to release the payment. It only takes effect when the money clears."
      : i.status === "payment_initiated"
        ? "The payment has been sent. Once the bank settles it, you will be asked to sign the unconditional release."
        : i.status === "paid"
          ? "You have been paid. Sign the unconditional release to close this payment out."
          : "Nothing to do right now.";
  return { explanation: parts.join(" "), nextStep: next, model: "deterministic" };
}

export async function explainPayment(i: ExplainInput): Promise<{ explanation: string; nextStep: string; model: string }> {
  if (!hasApiKey()) return deterministicExplanation(i);
  const client = anthropic();
  const res = await client.messages.parse({
    model: MODEL,
    max_tokens: 800,
    output_config: { effort: "low", format: zodOutputFormat(Out) },
    system:
      "You explain a construction progress payment to the subcontractor who is owed it. Use only the facts given: the amounts in cents (write them as dollars), the contract clauses quoted, and the statute summaries. Three to five short sentences, second person, no legal advice, no numbers that are not in the input. Then one sentence saying what the subcontractor should do next.",
    messages: [{ role: "user", content: JSON.stringify(i) }],
  });
  const out = res.parsed_output;
  if (!out) return deterministicExplanation(i);
  return { explanation: out.explanation, nextStep: out.nextStep, model: res.model };
}
