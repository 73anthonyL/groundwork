import type { listReleasesForOrg } from "@/server/scoped";
import { formatCents } from "@/lib/money";
import { releaseLabel } from "@/lib/release-label";
import { Countdown } from "@/components/countdown";
import { StatusPill } from "@/components/status-pill";
import { SUB_RELEASE as RELEASE } from "./status";
import { Table, TableBody, TableCell, TableChevron, TableEmpty, TableFoot, TableHead, TableHeader, TableLink, TableRow } from "@/components/ui/table";
import { isPaid, shortDay } from "./format";

type Release = Awaited<ReturnType<typeof listReleasesForOrg>>[number];

export const paymentHref = (r: { id: string; contractId: string }) => `/sub/contracts/${r.contractId}#release-${r.id}`;

/** "Paid Oct 16" once the money has landed, otherwise the deadline with the time left. */
function When({ r, nowIso }: { r: Release; nowIso: string }) {
  if (isPaid(r.status)) return <span className="type-meta text-muted-foreground">Paid {shortDay(r.payment?.updatedAt ?? r.createdAt)}</span>;
  return <Countdown deadline={r.payByAt?.toISOString() ?? null} amountCents={r.releaseCents} settled={false} nowIso={nowIso} label="Due" />;
}

/**
 * Payments to this company: what it is for, the project, where it stands, when it is due or landed,
 * and the amount. Each row opens the payment's timeline on its contract. On a phone the project,
 * status and date fold under the name so the row still fits.
 */
export function PaymentsTable({ releases, nowIso, total = false, empty }: { releases: Release[]; nowIso: string; total?: boolean; empty: React.ReactNode }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Payment</TableHead>
          <TableHead className="max-sm:hidden">Project</TableHead>
          <TableHead className="max-sm:hidden">Status</TableHead>
          <TableHead className="max-md:hidden">Due or paid</TableHead>
          <TableHead numeric>Amount</TableHead>
          <th className="w-8 max-sm:hidden">
            <span className="sr-only">Open</span>
          </th>
        </TableRow>
      </TableHeader>
      <TableBody>
        {releases.length === 0 && <TableEmpty colSpan={6}>{empty}</TableEmpty>}
        {releases.map((r) => (
          <TableRow key={r.id}>
            <TableCell>
              <TableLink href={paymentHref(r)}>{releaseLabel(r)}</TableLink>
              <div className="mt-1 flex flex-col items-start gap-1 sm:hidden">
                <span className="type-meta text-muted-foreground">{r.contract.project.name}</span>
                <StatusPill status={r.status} map={RELEASE} />
              </div>
              <div className="mt-1 md:hidden">
                <When r={r} nowIso={nowIso} />
              </div>
            </TableCell>
            <TableCell muted className="max-sm:hidden">
              {r.contract.project.name}
            </TableCell>
            <TableCell className="max-sm:hidden">
              <StatusPill status={r.status} map={RELEASE} />
            </TableCell>
            <TableCell className="max-md:hidden">
              <When r={r} nowIso={nowIso} />
            </TableCell>
            <TableCell numeric className="max-sm:align-top">
              {formatCents(r.releaseCents)}
            </TableCell>
            <TableChevron className="max-sm:hidden" />
          </TableRow>
        ))}
      </TableBody>
      {total && releases.length > 1 && (
        <TableFoot>
          <TableRow>
            <TableCell>Total</TableCell>
            <TableCell className="max-sm:hidden" />
            <TableCell className="max-sm:hidden" />
            <TableCell className="max-md:hidden" />
            <TableCell numeric>{formatCents(releases.reduce((s, r) => s + r.releaseCents, 0))}</TableCell>
            <td className="max-sm:hidden" />
          </TableRow>
        </TableFoot>
      )}
    </Table>
  );
}
