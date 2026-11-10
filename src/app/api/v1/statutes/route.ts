import { STATES, coverage } from "@/domain/statutes";
import { fail, json } from "@/server/read/api";

const RULES = ["promptPay", "retainageCap", "retainageRelease", "payIfPaid", "lienWaiver"] as const;

/** GET /api/v1/statutes[?rule=promptPay]: the statutory overlay for every jurisdiction. Public: it is reference data. */
export async function GET(req: Request) {
  const rule = new URL(req.url).searchParams.get("rule");
  if (rule && !RULES.includes(rule as (typeof RULES)[number])) return fail(400, "unknown_rule", `Unknown rule "${rule}". Use ${RULES.join(", ")}.`);
  const states = rule ? STATES.map((s) => ({ state: s.state, name: s.name, [rule]: s[rule as (typeof RULES)[number]] })) : STATES;
  return json({ coverage: coverage(), states });
}
