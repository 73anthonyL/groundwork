import Link from "next/link";
import { requireAuth } from "@/server/auth";
import { listPayments } from "@/server/read/gc-money";
import { now } from "@/server/clock";
import { PageBody, PageHeader } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button";
import { Tabs } from "@/components/ui/tabs";
import { PAYMENT_FILTERS, PaymentsTable, paymentFilter, type PaymentFilter } from "./payments-table";

export const metadata = { title: "Payments" };

/** Every payment from the contractor to a subcontractor, across projects. The tab is in the address. */
export default async function PaymentsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status } = await searchParams;
  const { org } = await requireAuth("gc");
  const all = await listPayments(org);
  const filter = paymentFilter(all, status);
  const href = (f: PaymentFilter) => `/gc/payments?status=${f}`;
  return (
    <>
      <PageHeader
        title="Payments"
        description="What you owe and have paid your subcontractors. Each payment is split from an owner payment by that subcontract's approved rules."
        actions={
          <Link href="/gc/ledger" className={buttonVariants({ variant: "secondary" })}>
            Ledger entries
          </Link>
        }
        tabs={<Tabs label="Payments by status" current={href(filter)} items={(Object.keys(PAYMENT_FILTERS) as PaymentFilter[]).map((f) => ({ href: href(f), label: PAYMENT_FILTERS[f].label, count: all.filter(PAYMENT_FILTERS[f].match).length }))} />}
      />
      <PageBody>
        <PaymentsTable rows={all.filter(PAYMENT_FILTERS[filter].match)} nowIso={now().toISOString()} empty={PAYMENT_FILTERS[filter].empty} />
      </PageBody>
    </>
  );
}
