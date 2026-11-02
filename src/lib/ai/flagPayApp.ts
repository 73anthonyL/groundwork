/**
 * Claude phrases the deterministic check results for a reviewer, citing the rule fields.
 * It never computes amounts: the numbers come from checks.ts. Without an API key it returns [].
 */
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { anthropic, hasApiKey, MODEL } from "./client";
import type { Check } from "@/domain/payapp/checks";

export const PayAppFlagSchema = z.object({
  flags: z.array(
    z.object({
      checkId: z.string(),
      severity: z.enum(["blocker", "warning", "note"]),
      /** One or two sentences for the controller, in plain English, citing the rule field by name. */
      message: z.string(),
      /** What the reviewer should do next. */
      recommendation: z.string(),
    }),
  ),
});
export type PayAppFlag = z.infer<typeof PayAppFlagSchema>["flags"][number];

export async function flagPayApp(input: {
  subName: string;
  number: number;
  checks: Check[];
  rules: { retainageBps: number | null } | null;
}): Promise<PayAppFlag[]> {
  const interesting = input.checks.filter((c) => c.status !== "pass");
  if (!interesting.length || !hasApiKey()) return [];
  const client = anthropic();
  const res = await client.messages.parse({
    model: MODEL,
    max_tokens: 1500,
    output_config: { effort: "low", format: zodOutputFormat(PayAppFlagSchema) },
    system:
      "You write short review notes for a construction controller. You are given the results of deterministic checks on a subcontractor's pay application. Explain each non-passing check in plain English, name the contract rule it relies on (for example 'retainage.percent_bps, the 10% in the subcontract'), state the dollar impact using only the cents provided (format as dollars), and recommend the next step. Never invent numbers or rules.",
    messages: [
      {
        role: "user",
        content: JSON.stringify({ subcontractor: input.subName, payApplication: input.number, rules: input.rules, checks: interesting }),
      },
    ],
  });
  return res.parsed_output?.flags ?? [];
}
