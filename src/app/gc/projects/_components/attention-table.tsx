import Link from "next/link";
import type { AttentionItem } from "@/server/read/gc-lists";
import { formatCents } from "@/lib/money";
import { buttonVariants } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableLink, TableRow } from "@/components/ui/table";
import { StatusPill, CONTRACT, PAY_APP, RELEASE } from "@/components/status-pill";
import { Countdown } from "@/components/countdown";

const MAP = { pay_app: PAY_APP, rules: CONTRACT, payment: RELEASE } as const;

/**
 * What is waiting on the contractor, one row each, with the one thing to do about it.
 * `showProject` adds the project column (Home, across projects). `primaryId` marks the row whose
 * action is already the page's primary button, so the table does not add a second one.
 */
export function AttentionTable({ items, nowIso, showProject = false, empty = "Nothing is waiting on you." }: { items: AttentionItem[]; nowIso: string; showProject?: boolean; empty?: string }) {
  const cols = showProject ? 6 : 5;
  return (
    <Table className="min-w-[680px]">
      <TableHeader>
        <TableRow>
          <TableHead>Item</TableHead>
          {showProject && <TableHead>Project</TableHead>}
          <TableHead>Subcontractor</TableHead>
          <TableHead numeric>Amount</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>
            <span className="sr-only">Action</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.length === 0 && <TableEmpty colSpan={cols}>{empty}</TableEmpty>}
        {items.map((it) => (
          <TableRow key={it.id}>
            <TableCell>
              <TableLink href={it.href}>{it.what}</TableLink>
            </TableCell>
            {showProject && (
              <TableCell muted>
                <Link href={`/gc/projects/${it.projectId}`} className="rounded-sm underline-offset-4 hover:text-foreground hover:underline">
                  {it.projectName}
                </Link>
              </TableCell>
            )}
            <TableCell>{it.subName}</TableCell>
            <TableCell numeric>{it.amountCents === null ? "" : formatCents(it.amountCents)}</TableCell>
            <TableCell>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <StatusPill status={it.status} map={MAP[it.kind]} />
                {it.kind === "payment" && <Countdown deadline={it.deadline} amountCents={it.amountCents ?? 0} settled={false} nowIso={nowIso} label="Pay by" />}
              </div>
            </TableCell>
            <TableCell className="w-px text-right whitespace-nowrap">
              <Link href={it.href} className={buttonVariants({ variant: "secondary", size: "sm" })}>
                {it.action}
              </Link>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
