import Link from "next/link";
import type { Organization } from "@/db/schema";
import { listProjects } from "@/server/scoped";
import { projectSummary } from "@/server/read/project";
import { STATE_LAW } from "@/domain/statutes";
import { formatCents } from "@/lib/money";
import { buttonVariants } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableChevron, TableEmpty, TableFoot, TableHead, TableHeader, TableLink, TableRow } from "@/components/ui/table";

/** "7 days by statute", "10 days unless the contract says otherwise", "Contract terms". */
export function deadlineText(state: string): string {
  const law = STATE_LAW[state]?.promptPay;
  if (!law || law.days === null) return "Set by each subcontract";
  return `${law.days} days${law.contractCanOverride === false ? ", fixed by statute" : ""}`;
}

/** The contractor's projects with where their money stands. An empty table keeps its headers. */
export async function ProjectsTable({ org, createAction = true }: { org: Organization; createAction?: boolean }) {
  const projects = await listProjects(org);
  const rows = await Promise.all(projects.map(async (p) => ({ p, t: (await projectSummary(org, p.id))?.totals ?? null })));
  const sum = (k: "inMotionCents" | "paidCents" | "retainageHeldCents") => rows.reduce((s, r) => s + (r.t?.[k] ?? 0), 0);
  return (
    <Table className="min-w-[760px]">
      <TableHeader>
        <TableRow>
          <TableHead>Project</TableHead>
          <TableHead>Owner</TableHead>
          <TableHead>State</TableHead>
          <TableHead>Pay subcontractors within</TableHead>
          <TableHead numeric>Owed now</TableHead>
          <TableHead numeric>Paid</TableHead>
          <TableHead numeric>Retainage held</TableHead>
          <TableHead>
            <span className="sr-only">Open</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.length === 0 && (
          <TableEmpty
            colSpan={8}
            action={
              createAction ? (
                <Link href="/gc/projects/new" className={buttonVariants({ variant: "secondary", size: "sm" })}>
                  Create project
                </Link>
              ) : undefined
            }
          >
            No projects yet.
          </TableEmpty>
        )}
        {rows.map(({ p, t }) => (
          <TableRow key={p.id}>
            <TableCell>
              <TableLink href={`/gc/projects/${p.id}`} className="whitespace-nowrap">
                {p.name}
              </TableLink>
            </TableCell>
            <TableCell className="whitespace-nowrap">{p.owner.name}</TableCell>
            <TableCell className="whitespace-nowrap">{STATE_LAW[p.state]?.name ?? p.state}</TableCell>
            <TableCell muted className="whitespace-nowrap">
              {deadlineText(p.state)}
            </TableCell>
            <TableCell numeric className={t && t.inMotionCents > 0 ? "font-medium" : "text-muted-foreground"}>
              {formatCents(t?.inMotionCents ?? 0)}
            </TableCell>
            <TableCell numeric>{formatCents(t?.paidCents ?? 0)}</TableCell>
            <TableCell numeric>{formatCents(t?.retainageHeldCents ?? 0)}</TableCell>
            <TableChevron />
          </TableRow>
        ))}
      </TableBody>
      {rows.length > 1 && (
        <TableFoot>
          <TableRow>
            <TableCell colSpan={4}>
              {rows.length} projects
            </TableCell>
            <TableCell numeric>{formatCents(sum("inMotionCents"))}</TableCell>
            <TableCell numeric>{formatCents(sum("paidCents"))}</TableCell>
            <TableCell numeric>{formatCents(sum("retainageHeldCents"))}</TableCell>
            <TableCell />
          </TableRow>
        </TableFoot>
      )}
    </Table>
  );
}
