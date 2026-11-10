import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireAuth } from "@/server/auth";
import { listBillableContracts, payAppFormContext } from "@/server/read/sub";
import { PayAppForm } from "@/components/pay-app-form";
import { PageBody, PageHeader } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button";
import { ID } from "@/db/seed";
import { stableId } from "@/lib/ids";
import { dollars, formatBps, formatCentsCompact } from "@/lib/money";
import { Notice } from "../../_shared/notice";

export const metadata = { title: "New pay app" };

export default async function NewPayAppPage({ searchParams }: { searchParams: Promise<{ contract?: string }> }) {
  const { contract: contractId } = await searchParams;
  const { org } = await requireAuth("sub");
  if (!contractId) {
    // No contract named: go straight to the form when only one can be billed, otherwise let them pick.
    const billable = (await listBillableContracts(org)).filter((c) => c.billing.billable);
    redirect(billable.length === 1 ? `/sub/pay-apps/new?contract=${billable[0].id}` : "/sub/pay-apps");
  }
  const ctx = await payAppFormContext(org, contractId);
  if (!ctx) notFound();
  const { contract, billing } = ctx;
  const contractHref = `/sub/contracts/${contract.id}`;
  const crumbs = [{ label: "Pay apps", href: "/sub/pay-apps" }, { label: contract.trade, href: contractHref }, { label: `Pay app #${billing.nextNumber}` }];

  if (!billing.billable) {
    return (
      <>
        <PageHeader width="form" breadcrumbs={crumbs} title={`Pay app #${billing.nextNumber}`} description={`${contract.trade} on ${contract.project.name}`} />
        <PageBody width="form">
          <Notice tone="hold" title="You cannot bill this contract yet">
            <p>{billing.reason}</p>
          </Notice>
          <div>
            <Link href={contractHref} className={buttonVariants({ variant: "secondary" })}>
              Open the contract
            </Link>
          </div>
        </PageBody>
      </>
    );
  }

  // Sample data shortcut: Summit's second pay app as the seeded scenario has it (5% retainage where the contract says 10%).
  const prefill =
    contract.id === ID.contract.summit && billing.nextNumber === 2
      ? { lines: { [stableId(`sov:${contract.id}:2`)]: dollars(40_000), [stableId(`sov:${contract.id}:3`)]: dollars(10_000) }, retainage: dollars(2_500) }
      : undefined;

  return (
    <>
      <PageHeader
        breadcrumbs={crumbs}
        title={`Pay app #${billing.nextNumber} for ${billing.periodMonth}`}
        description={`${contract.trade} on ${contract.project.name}, billed to ${contract.project.gc.name}. ${formatCentsCompact(contract.contractSumCents)} contract${ctx.retainageBps !== null ? `, ${formatBps(ctx.retainageBps)} retainage` : ""}.`}
      />
      <PageBody>
        <PayAppForm
          contractId={contract.id}
          nextNumber={billing.nextNumber}
          periodThrough={billing.periodThrough}
          lines={ctx.lines}
          contractSumCents={contract.contractSumCents}
          previouslyBilledCents={ctx.previouslyBilledCents}
          retainageBps={ctx.retainageBps}
          storedMaterialsAllowed={ctx.storedMaterialsAllowed}
          payerName={contract.project.gc.name}
          cancelHref={contractHref}
          prefill={prefill}
          lowerTier={ctx.lowerTier}
        />
      </PageBody>
    </>
  );
}
