import Link from "next/link";
import { Plus } from "lucide-react";
import { requireAuth } from "@/server/auth";
import { listBillableContracts, listPayAppsForOrg } from "@/server/read/sub";
import { formatCents } from "@/lib/money";
import { PageBody, PageHeader } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button";
import { Section } from "@/components/ui/panel";
import { Table, TableBody, TableCell, TableEmpty, TableFoot, TableHead, TableHeader, TableLink, TableRow } from "@/components/ui/table";
import { StatusPill } from "@/components/status-pill";
import { SUB_PAY_APP as PAY_APP } from "../_shared/status";
import { isoDay } from "../_shared/format";

export const metadata = { title: "Pay apps" };

export default async function SubPayAppsPage() {
  const { org } = await requireAuth("sub");
  const [apps, contracts] = await Promise.all([listPayAppsForOrg(org), listBillableContracts(org)]);
  const billable = contracts.filter((c) => c.billing.billable);
  const waiting = contracts.filter((c) => !c.billing.billable && c.billing.reason);
  const newHref = (id: string) => `/sub/pay-apps/new?contract=${id}`;
  const billed = apps.reduce((s, p) => s + p.workThisPeriodCents + p.storedMaterialsCents, 0);
  const net = apps.reduce((s, p) => s + (p.netDueApprovedCents ?? p.netDueBilledCents), 0);

  return (
    <>
      <PageHeader
        title="Pay apps"
        description="Every pay app your company has submitted, across all contracts."
        actions={
          billable.length === 1 ? (
            <Link href={newHref(billable[0].id)} className={buttonVariants()}>
              <Plus aria-hidden />
              New pay app
            </Link>
          ) : undefined
        }
      />
      <PageBody>
        {billable.length > 1 && (
          <Section title="Bill for this period" description="Pick the contract to bill.">
            <ul className="divide-y border-y">
              {billable.map((c) => (
                <li key={c.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
                  <div className="min-w-0">
                    <p className="text-sm leading-5 font-medium">
                      {c.trade} on {c.project.name}
                    </p>
                    <p className="type-meta mt-0.5 text-muted-foreground">
                      Pay app #{c.billing.nextNumber}, for work through {isoDay(c.billing.periodThrough)}. {formatCents(c.billing.balanceCents)} left to bill.
                    </p>
                  </div>
                  <Link href={newHref(c.id)} className={buttonVariants({ variant: "secondary", className: "shrink-0 max-sm:h-10 max-sm:w-full" })}>
                    Bill for {c.billing.periodMonth}
                  </Link>
                </li>
              ))}
            </ul>
          </Section>
        )}
        {billable.length === 0 && waiting.length > 0 && (
          <p className="py-2 text-sm leading-5 text-muted-foreground">
            Nothing to bill right now.{" "}
            {waiting.map((c) => (
              <span key={c.id}>
                {c.trade} on {c.project.name}: {c.billing.reason}{" "}
              </span>
            ))}
          </p>
        )}

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Pay app</TableHead>
              <TableHead className="max-sm:hidden">Project</TableHead>
              <TableHead className="max-md:hidden">Period through</TableHead>
              <TableHead className="max-sm:hidden">Status</TableHead>
              <TableHead numeric>Billed</TableHead>
              <TableHead numeric className="max-md:hidden">
                Net due
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {apps.length === 0 && (
              <TableEmpty
                colSpan={6}
                action={
                  billable[0] ? (
                    <Link href={newHref(billable[0].id)} className={buttonVariants({ variant: "secondary", size: "sm" })}>
                      Bill for {billable[0].billing.periodMonth}
                    </Link>
                  ) : undefined
                }
              >
                {contracts.length === 0 ? "No pay apps yet. You can bill once your contractor approves your contract's payment rules." : "No pay apps yet."}
              </TableEmpty>
            )}
            {apps.map((p) => (
              <TableRow key={p.id}>
                <TableCell>
                  <TableLink href={`/sub/contracts/${p.contract.id}#pay-app-${p.id}`}>Pay app #{p.number}</TableLink>
                  <div className="type-meta text-muted-foreground">
                    <span className="sm:hidden">{p.contract.project.name}, </span>
                    {p.contract.trade}
                    <span className="md:hidden">, through {isoDay(p.periodThrough)}</span>
                  </div>
                  <div className="mt-1 sm:hidden">
                    <StatusPill status={p.status} map={PAY_APP} />
                  </div>
                </TableCell>
                <TableCell muted className="max-sm:hidden">
                  {p.contract.project.name}
                </TableCell>
                <TableCell className="num max-md:hidden">{isoDay(p.periodThrough)}</TableCell>
                <TableCell className="max-sm:hidden">
                  <StatusPill status={p.status} map={PAY_APP} />
                </TableCell>
                <TableCell numeric className="max-sm:align-top">
                  {formatCents(p.workThisPeriodCents + p.storedMaterialsCents)}
                </TableCell>
                <TableCell numeric className="max-md:hidden">
                  {formatCents(p.netDueApprovedCents ?? p.netDueBilledCents)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
          {apps.length > 1 && (
            <TableFoot>
              <TableRow>
                <TableCell>Total</TableCell>
                <TableCell className="max-sm:hidden" />
                <TableCell className="max-md:hidden" />
                <TableCell className="max-sm:hidden" />
                <TableCell numeric>{formatCents(billed)}</TableCell>
                <TableCell numeric className="max-md:hidden">
                  {formatCents(net)}
                </TableCell>
              </TableRow>
            </TableFoot>
          )}
        </Table>
      </PageBody>
    </>
  );
}
