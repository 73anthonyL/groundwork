import { json } from "@/server/read/api";

/** GET /api/v1: what the read API offers. */
export async function GET() {
  return json({
    name: "Groundwork read API",
    auth: "Session cookie (sign in through the app). Every response is scoped to your organization.",
    envelope: "{ data, meta: { version, generatedAt } } on success; { error: { code, message } } otherwise.",
    money: "Integer cents. Percentages are basis points (500 = 5%). Times are ISO 8601 UTC.",
    endpoints: [
      { path: "/api/v1/projects", returns: "Projects you can see." },
      { path: "/api/v1/projects/:id", returns: "Everything below in one response. ?include=summary,flow,timeline,series,clocks narrows it." },
      { path: "/api/v1/projects/:id/summary", returns: "Ledger balances, totals, and one row per contract (billed, funded, paid, in motion, retainage, backcharges)." },
      { path: "/api/v1/projects/:id/flow", returns: "The project as a money graph: nodes (owner, contractor, subs, lower tier, retainage, backcharges) and links, grouped per funding event in arrival order." },
      { path: "/api/v1/projects/:id/timeline", returns: "The append-only event log as display entries with lane, title, actor and amount." },
      { path: "/api/v1/projects/:id/series", returns: "Running ledger balances after every posting." },
      { path: "/api/v1/projects/:id/clocks", returns: "Every release in motion with its deadline, time left, and the statute behind it." },
      { path: "/api/v1/statutes", returns: "The statutory overlay for all 50 states and DC with coverage counts. ?rule=promptPay|retainageCap|retainageRelease|payIfPaid|lienWaiver narrows each record to one rule." },
      { path: "/api/v1/statutes/:state", returns: "One state's full record, plus the overlay the engine applies. ?executedOn=YYYY-MM-DD&prime=<cents> evaluate date- and size-dependent rules." },
      { path: "/api/v1/eval", returns: "The latest extraction eval: headline metrics, the review-layer ablation, and every miss." },
    ],
  });
}
