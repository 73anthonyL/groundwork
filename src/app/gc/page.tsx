import Link from "next/link";
import { requireAuth } from "@/server/auth";
import { listProjects } from "@/server/scoped";
import { projectSummary } from "@/server/read/project";
import { STATE_LAW } from "@/domain/statutes";
import { formatCentsCompact } from "@/lib/money";

export default async function GcHome() {
  const { org } = await requireAuth("gc");
  const projects = await listProjects(org);
  const summaries = await Promise.all(projects.map((p) => projectSummary(org, p.id)));
  return (
    <div>
      <h1 className="text-3xl font-semibold">Projects</h1>
      <p className="mt-1 text-sm text-muted-foreground">Each project runs under the payment law of its own state.</p>
      {projects.length === 0 ? (
        <p className="mt-4 text-muted-foreground">No projects yet. Run the demo reset to seed them.</p>
      ) : (
        <ul className="mt-6 grid gap-4 lg:grid-cols-2">
          {projects.map((p, i) => {
            const t = summaries[i]?.totals;
            const law = STATE_LAW[p.state];
            return (
              <li key={p.id} className="rounded-lg border bg-card p-5 shadow-card">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="type-label text-muted-foreground">{law?.name ?? p.state}</div>
                    <Link href={`/gc/projects/${p.id}`} className="mt-1 block text-xl font-semibold hover:underline">
                      {p.name}
                    </Link>
                    <div className="mt-0.5 truncate text-sm text-muted-foreground">
                      {p.owner.name} · {p.address}
                    </div>
                  </div>
                  <div className="num shrink-0 text-right text-sm text-muted-foreground">
                    prime <span className="font-medium text-foreground">{formatCentsCompact(p.primeContractSumCents)}</span>
                  </div>
                </div>
                {t && (
                  <dl className="num mt-4 grid grid-cols-3 gap-3 border-t pt-3 text-sm">
                    <div>
                      <dt className="text-xs text-muted-foreground">Paid to subs</dt>
                      <dd className="font-semibold text-settled">{formatCentsCompact(t.paidCents)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">On its way</dt>
                      <dd className="font-semibold text-money">{formatCentsCompact(t.inMotionCents)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Retainage held</dt>
                      <dd className="font-semibold text-hold">{formatCentsCompact(t.retainageHeldCents)}</dd>
                    </div>
                  </dl>
                )}
                {law && (
                  <p className="mt-3 text-xs text-muted-foreground">
                    {law.promptPay.days === null ? "No private prompt-pay deadline" : `Subs paid within ${law.promptPay.days} days of the owner's payment`}
                    {law.promptPay.contractCanOverride === false ? ", and the contract cannot lengthen it" : ""}
                    {" · "}pay-if-paid {law.payIfPaid.status}
                    {" · "}
                    <Link href="/statutes" className="underline underline-offset-2">
                      {law.promptPay.cite || "statute library"}
                    </Link>
                  </p>
                )}
                <div className="mt-4 flex gap-4 text-sm">
                  <Link href={`/gc/projects/${p.id}`} className="font-medium underline underline-offset-2">
                    Board
                  </Link>
                  <Link href={`/gc/projects/${p.id}/live`} className="font-medium underline underline-offset-2">
                    Live view
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
