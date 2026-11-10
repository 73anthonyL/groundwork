import Link from "next/link";
import { paymentOpen, type PaymentRow } from "@/server/read/gc-money";
import { formatCents } from "@/lib/money";
import { releaseLabel } from "@/lib/release-label";
import { buttonVariants } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableChevron, TableEmpty, TableFoot, TableHead, TableHeader, TableLink, TableRow } from "@/components/ui/table";
import { StatusPill, RELEASE } from "@/components/status-pill";
import { Countdown } from "@/components/countdown";

export type PaymentFilter = "open" | "paid" | "all";

export const PAYMENT_FILTERS: Record<PaymentFilter, { label: string; match: (r: PaymentRow) => boolean; empty: string }> = {
  open: { label: "On its way", match: (r) => paymentOpen(r), empty: "Nothing is on its way. Every payment has reached its subcontractor." },
  paid: { label: "Paid", match: (r) => r.status === "paid" || r.status === "settled", empty: "No payments have been paid yet." },
  all: { label: "All", match: () => true, empty: "No payments yet. They appear here when you record an owner payment on a project." },
};

/** Which tab to show: the one asked for, else "On its way" when something is, else everything. */
export function paymentFilter(rows: PaymentRow[], asked: string | undefined): PaymentFilter {
  if (asked === "open" || asked === "paid" || asked === "all") return asked;
  return rows.some(PAYMENT_FILTERS.open.match) ? "open" : "all";
}

const day = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });

/**
 * A row of filter links for a page that already has tabs above it. The current one is outlined and
 * marked with aria-current; the choice lives in the address.
 */
export function FilterLinks({ label, items, current }: { label: string; items: { href: string; label: string; count: number }[]; current: string }) {
  return (
    <nav aria-label={label} className="flex flex-wrap items-center gap-1">
      {items.map((t) => (
        <Link key={t.href} href={t.href} aria-current={t.href === current ? "page" : undefined} className={buttonVariants({ variant: t.href === current ? "secondary" : "tertiary", size: "sm", className: t.href === current ? undefined : "text-muted-foreground!" })}>
          {t.label}
          <span className="num font-normal text-muted-foreground">{t.count}</span>
        </Link>
      ))}
    </nav>
  );
}

/** Payments to subcontractors, one row each, with the owner payment each was split from. */
export function PaymentsTable({ rows, nowIso, empty }: { rows: PaymentRow[]; nowIso: string; empty: string }) {
  return (
    <Table className="min-w-[880px]">
      <TableHeader>
        <TableRow>
          <TableHead>Subcontractor</TableHead>
          <TableHead>Project</TableHead>
          <TableHead>From owner payment</TableHead>
          <TableHead>For</TableHead>
          <TableHead numeric>Amount</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Deadline</TableHead>
          <TableHead>
            <span className="sr-only">Open</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.length === 0 && <TableEmpty colSpan={8}>{empty}</TableEmpty>}
        {rows.map((r) => (
          <TableRow key={r.id}>
            <TableCell>
              <TableLink href={`/gc/releases/${r.id}`} className="whitespace-nowrap">
                {r.subName}
              </TableLink>
            </TableCell>
            <TableCell muted className="whitespace-nowrap">
              <Link href={`/gc/projects/${r.projectId}/payments`} className="rounded-sm underline-offset-4 hover:text-foreground hover:underline">
                {r.projectName}
              </Link>
            </TableCell>
            <TableCell className="whitespace-nowrap">
              <Link href={`/gc/projects/${r.projectId}/payments#owner-payment-${r.ownerPayment.id}`} className="rounded-sm underline-offset-4 hover:underline">
                {day(r.ownerPayment.receivedAt)}
              </Link>
              <span className="type-mono ml-2 text-muted-foreground">{r.ownerPayment.reference}</span>
            </TableCell>
            <TableCell muted className="whitespace-nowrap">
              {releaseLabel({ kind: r.kind, payApplication: r.payAppNumber === null ? null : { number: r.payAppNumber } })}
            </TableCell>
            <TableCell numeric>{formatCents(r.releaseCents)}</TableCell>
            <TableCell>
              <StatusPill status={r.status} map={RELEASE} />
            </TableCell>
            <TableCell>
              <Countdown deadline={r.payByAt?.toISOString() ?? null} amountCents={r.releaseCents} settled={r.status === "paid" || r.status === "settled"} nowIso={nowIso} label="Pay by" />
            </TableCell>
            <TableChevron />
          </TableRow>
        ))}
      </TableBody>
      {rows.length > 1 && (
        <TableFoot>
          <TableRow>
            <TableCell colSpan={4}>{rows.length} payments</TableCell>
            <TableCell numeric>{formatCents(rows.reduce((s, r) => s + r.releaseCents, 0))}</TableCell>
            <TableCell colSpan={3} />
          </TableRow>
        </TableFoot>
      )}
    </Table>
  );
}
