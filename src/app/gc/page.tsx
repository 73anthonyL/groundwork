import Link from "next/link";
import { requireAuth } from "@/server/auth";
import { listProjects } from "@/server/scoped";
import { projectSummary } from "@/server/read/project";
import { STATE_LAW } from "@/domain/statutes";
import { formatCentsCompact } from "@/lib/money";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

/** The contractor's projects, busiest first. A project is a row: its money, and the law it runs under. */
export default async function GcHome() {
  const { org } = await requireAuth("gc");
  const projects = await listProjects(org);
  const rows = (await Promise.all(projects.map(async (p) => ({ p, t: (await projectSummary(org, p.id))?.totals ?? null })))).sort((a, b) => (b.t?.billedCents ?? 0) - (a.t?.billedCents ?? 0));
  const owed = rows.reduce((s, r) => s + (r.t?.inMotionCents ?? 0), 0);
  return (
    <div>
      <h1 className="text-[2rem] font-semibold leading-tight">Projects</h1>
      <p className="mt-1.5 text-sm text-muted-foreground">
        {rows.length === 0 ? "No projects yet." : owed > 0 ? `${formatCentsCompact(owed)} is owed to subcontractors across ${rows.length} project${rows.length === 1 ? "" : "s"}.` : `Nothing is owed to subcontractors right now.`}
      </p>
      {rows.length === 0 ? (
        <div className="mt-8 rounded-xl bg-card px-6 py-10 text-center shadow-card">
          <p className="font-medium">No projects yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Load the demo projects from the <Link href="/demo" className="text-link hover:underline">demo panel</Link>.
          </p>
        </div>
      ) : (
        <div className="mt-8 overflow-hidden rounded-xl bg-card shadow-card">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Project</TableHead>
                <TableHead>Payment Law</TableHead>
                <TableHead className="text-right">Owed Now</TableHead>
                <TableHead className="text-right">Paid to Subs</TableHead>
                <TableHead className="text-right">Retainage Held</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(({ p, t }) => {
                const law = STATE_LAW[p.state];
                return (
                  <TableRow key={p.id}>
                    <TableCell className="py-4">
                      <Link href={`/gc/projects/${p.id}`} className="text-[15px] font-semibold text-link hover:underline">
                        {p.name}
                      </Link>
                      <div className="text-[13px] text-muted-foreground">
                        {p.owner.name}, <span className="num">{formatCentsCompact(p.primeContractSumCents)}</span> prime contract
                      </div>
                    </TableCell>
                    <TableCell className="py-4">
                      <div>{law?.name ?? p.state}</div>
                      <div className="text-[13px] text-muted-foreground">
                        {law?.promptPay.days == null ? "No statutory deadline" : `Pay subs within ${law.promptPay.days} days`}
                        {law?.promptPay.contractCanOverride === false ? ", fixed by statute" : ""}
                      </div>
                    </TableCell>
                    <TableCell className="num py-4 text-right text-[15px] font-semibold">{t && t.inMotionCents > 0 ? formatCentsCompact(t.inMotionCents) : <span className="font-normal text-muted-foreground">none</span>}</TableCell>
                    <TableCell className="num py-4 text-right">{formatCentsCompact(t?.paidCents ?? 0)}</TableCell>
                    <TableCell className="num py-4 text-right">{formatCentsCompact(t?.retainageHeldCents ?? 0)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
