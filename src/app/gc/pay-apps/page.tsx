import { requireAuth } from "@/server/auth";
import { listPayApps } from "@/server/read/gc-money";
import { PageBody, PageHeader } from "@/components/page-header";
import { Tabs } from "@/components/ui/tabs";
import { PAY_APP_FILTERS, PayAppsTable, payAppFilter, type PayAppFilter } from "./pay-apps-table";

export const metadata = { title: "Pay apps" };

/** Every pay app the contractor has received, across projects. The tab is in the address. */
export default async function PayAppsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status } = await searchParams;
  const { org } = await requireAuth("gc");
  const all = await listPayApps(org);
  const filter = payAppFilter(all, status);
  const href = (f: PayAppFilter) => `/gc/pay-apps?status=${f}`;
  return (
    <>
      <PageHeader
        title="Pay apps"
        description="What your subcontractors have billed. Each one is checked against its subcontract's payment rules before you approve it."
        tabs={<Tabs label="Pay apps by status" current={href(filter)} items={(Object.keys(PAY_APP_FILTERS) as PayAppFilter[]).map((f) => ({ href: href(f), label: PAY_APP_FILTERS[f].label, count: all.filter(PAY_APP_FILTERS[f].match).length }))} />}
      />
      <PageBody>
        <PayAppsTable rows={all.filter(PAY_APP_FILTERS[filter].match)} showProject empty={PAY_APP_FILTERS[filter].empty} />
      </PageBody>
    </>
  );
}
