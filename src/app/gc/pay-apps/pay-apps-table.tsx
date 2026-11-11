import Link from "next/link";
import type { PayAppRow } from "@/server/read/gc-money";
import { formatCents } from "@/lib/money";
import { Table, TableBody, TableCell, TableChevron, TableEmpty, TableFoot, TableHead, TableHeader, TableLink, TableRow } from "@/components/ui/table";
import { StatusPill, PAY_APP } from "@/components/status-pill";

export type PayAppFilter = "review" | "approved" | "all";

export const PAY_APP_FILTERS: Record<PayAppFilter, { label: string; match: (a: PayAppRow) => boolean; empty: string }> = {
  review: { label: "To review", match: (a) => a.status === "submitted", empty: "No pay apps are waiting for your review." },
  approved: { label: "Approved", match: (a) => a.status === "approved" || a.status === "funded" || a.status === "closed", empty: "No approved pay apps yet." },
  all: { label: "All", match: () => true, empty: "No pay apps yet. They appear here when a subcontractor bills for a period." },
};

/** Which tab to show: the one asked for, else "To review" when something is waiting, else everything. */
export function payAppFilter(rows: PayAppRow[], asked: string | undefined): PayAppFilter {
  if (asked === "review" || asked === "approved" || asked === "all") return asked;
  return rows.some(PAY_APP_FILTERS.review.match) ? "review" : "all";
}

const day = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
const isoDay = (iso: string) => day(new Date(`${iso}T00:00:00`));

/** Pay apps, one row each. `showProject` adds the project column for the list across projects. */
export function PayAppsTable({ rows, showProject = false, empty }: { rows: PayAppRow[]; showProject?: boolean; empty: string }) {
  const cols = showProject ? 8 : 7;
  return (
    <Table className="min-w-[760px]">
      <TableHeader>
        <TableRow>
          <TableHead>Subcontractor</TableHead>
          {showProject && <TableHead>Project</TableHead>}
          <TableHead>Pay app</TableHead>
          <TableHead>Work through</TableHead>
          <TableHead numeric>Billed</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Submitted</TableHead>
          <TableHead>
            <span className="sr-only">Open</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.length === 0 && <TableEmpty colSpan={cols}>{empty}</TableEmpty>}
        {rows.map((a) => (
          <TableRow key={a.id}>
            <TableCell>
              <TableLink href={`/gc/pay-apps/${a.id}`} mark={a.subName} className="whitespace-nowrap">
                {a.subName}
              </TableLink>
            </TableCell>
            {showProject && (
              <TableCell muted className="whitespace-nowrap">
                <Link href={`/gc/projects/${a.projectId}/pay-apps`} className="rounded-sm underline-offset-4 hover:text-foreground hover:underline">
                  {a.projectName}
                </Link>
              </TableCell>
            )}
            <TableCell className="type-mono whitespace-nowrap">
              #{a.number}
              {a.isFinal ? <span className="font-sans text-muted-foreground"> final</span> : null}
            </TableCell>
            <TableCell className="whitespace-nowrap">{isoDay(a.periodThrough)}</TableCell>
            <TableCell numeric>{formatCents(a.billedCents)}</TableCell>
            <TableCell>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <StatusPill status={a.status} map={PAY_APP} />
                {a.status === "submitted" && a.failing > 0 && (
                  <span className="type-meta whitespace-nowrap text-destructive">
                    {a.failing} requirement{a.failing === 1 ? "" : "s"} failed
                  </span>
                )}
              </div>
            </TableCell>
            <TableCell muted className="whitespace-nowrap">
              {a.submittedAt ? day(a.submittedAt) : ""}
            </TableCell>
            <TableChevron />
          </TableRow>
        ))}
      </TableBody>
      {rows.length > 1 && (
        <TableFoot>
          <TableRow>
            <TableCell colSpan={showProject ? 4 : 3}>{rows.length} pay apps</TableCell>
            <TableCell numeric>{formatCents(rows.reduce((s, a) => s + a.billedCents, 0))}</TableCell>
            <TableCell colSpan={3} />
          </TableRow>
        </TableFoot>
      )}
    </Table>
  );
}
