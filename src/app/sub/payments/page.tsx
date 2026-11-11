import { requireAuth } from "@/server/auth";
import { listReleasesForOrg } from "@/server/scoped";
import { now } from "@/server/clock";
import { formatCents } from "@/lib/money";
import { PageBody, PageHeader } from "@/components/page-header";
import { MoneySummary } from "@/components/money-summary";
import { PaymentsTable } from "../_shared/payments-table";
import { isOnItsWay, isPaid, retainageHeld } from "../_shared/format";

export const metadata = { title: "Payments" };

export default async function SubPaymentsPage() {
  const { org } = await requireAuth("sub");
  const releases = await listReleasesForOrg(org);
  const owed = releases.filter(isOnItsWay).reduce((s, r) => s + r.releaseCents, 0);
  const paid = releases.filter((r) => isPaid(r.status)).reduce((s, r) => s + r.releaseCents, 0);
  const held = releases.reduce((s, r) => s + retainageHeld(r), 0);

  return (
    <>
      <PageHeader title="Payments" />
      <PageBody>
        {releases.length > 0 && (
          <MoneySummary
            lead={{ label: "On its way to you", value: formatCents(owed), tone: owed > 0 ? "money" : "default" }}
            parts={[
              { label: "Paid to date", cents: paid, kind: "paid" },
              { label: "On its way", cents: owed, kind: "moving" },
              { label: "Held as retainage", cents: held, kind: "held" },
            ]}
          />
        )}
        <PaymentsTable releases={releases} nowIso={now().toISOString()} total empty="No payments yet. One appears here when the owner pays the contractor for a pay app you submitted." />
      </PageBody>
    </>
  );
}
