import Link from "next/link";
import { requireAuth } from "@/server/auth";
import { listProjects } from "@/server/scoped";
import { projectSummary } from "@/server/read/project";
import { STATE_LAW } from "@/domain/statutes";
import { formatCentsCompact } from "@/lib/money";
import { FileUp } from "lucide-react";
import { PageHero } from "@/components/page-hero";
import { buttonVariants } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

/** The contractor's projects, busiest first. A project is a row: its money, and the law it runs under. */
export default async function GcHome() {
  const { org, user } = await requireAuth("gc");
  const projects = await listProjects(org);
  const rows = (await Promise.all(projects.map(async (p) => ({ p, t: (await projectSummary(org, p.id))?.totals ?? null })))).sort((a, b) => (b.t?.billedCents ?? 0) - (a.t?.billedCents ?? 0));
  const owed = rows.reduce((s, r) => s + (r.t?.inMotionCents ?? 0), 0);
  return (
    <div>
      <PageHero
        title="Your projects"
        lede={`You are ${user.name}, ${(user.title ?? "controller").toLowerCase()} at ${org.name}, the general contractor. You get paid by the owner and pay the subcontractors. Open a project to add a subcontract, review a sub's bill, or record a payment from the owner.`}
        figure={{ label: "Owed to subcontractors now", value: formatCentsCompact(owed), note: rows.length === 0 ? "No projects yet." : `Across ${rows.length} project${rows.length === 1 ? "" : "s"}.` }}
        actions={
          rows[0] && (
            <>
              <Link href={`/gc/projects/${rows[0].p.id}`} className={buttonVariants({ variant: "signal", size: "lg" })}>
                Open {rows[0].p.name}
              </Link>
              <Link href={`/gc/projects/${rows[0].p.id}/subcontracts/new`} className={buttonVariants({ variant: "stage", size: "lg" })}>
                <FileUp aria-hidden />
                Add a subcontract
              </Link>
            </>
          )
        }
      />
      {rows.length === 0 ? (
        <div className="rounded-xl bg-card px-6 py-10 text-center shadow-card">
          <p className="font-medium">No projects yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Load the demo projects from the <Link href="/demo" className="text-link hover:underline">demo panel</Link>.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl bg-card shadow-card">
          <Table className="min-w-[640px]">
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
                      <Link href={`/gc/projects/${p.id}`} className="whitespace-nowrap text-[15px] font-semibold text-link hover:underline">
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
