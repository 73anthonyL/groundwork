import Link from "next/link";
import { notFound } from "next/navigation";
import { FileText } from "lucide-react";
import { requireAuth } from "@/server/auth";
import { getContract, getContractAdjustments, listReleasesForContract } from "@/server/scoped";
import { billingState } from "@/server/read/sub";
import { latestExplanation } from "@/server/actions/explain";
import type { StoredRules } from "@/server/rules/review";
import { now } from "@/server/clock";
import { formatCents, formatCentsCompact } from "@/lib/money";
import { releaseLabel } from "@/lib/release-label";
import { ContractAdjustments } from "@/components/contract-adjustments";
import { ReleaseTimeline } from "@/components/release-timeline";
import { PageBody, PageHeader } from "@/components/page-header";
import { StatusPill } from "@/components/status-pill";
import { SUB_CONTRACT, SUB_PAY_APP as PAY_APP, SUB_RELEASE as RELEASE } from "../../_shared/status";
import { Button, buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Panel, Section } from "@/components/ui/panel";
import { Table, TableBody, TableCell, TableEmpty, TableFoot, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Notice } from "../../_shared/notice";
import { fullDay, isConditional, isoDay } from "../../_shared/format";
import { plainRules } from "../../_shared/rules";
import { addLowerTierAction, explainAction, requestChangeOrderAction } from "./actions";

export default async function SubContractPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ signed?: string; submitted?: string; msg?: string }> }) {
  const { id } = await params;
  const { signed, submitted, msg } = await searchParams;
  const { org } = await requireAuth("sub");
  const contract = await getContract(org, id);
  if (!contract) notFound();
  const releases = await listReleasesForContract(org, id);
  const adjustments = contract.status === "active" ? await getContractAdjustments(org, id) : null;
  const explanations = Object.fromEntries(await Promise.all(releases.map(async (r) => [r.id, await latestExplanation(r.id)] as const)));
  const nowIso = now().toISOString();
  const gc = contract.project.gc.name;
  const billing = billingState(contract, contract.payApplications);
  const active = contract.status === "active" ? contract.ruleSets.find((r) => r.id === contract.activeRuleSetId) : undefined;
  const rules = active ? plainRules(active.rules as StoredRules, gc) : null;
  const apps = contract.payApplications;
  const justSubmitted = submitted ? apps.find((p) => p.id === submitted) : undefined;
  const newHref = `/sub/pay-apps/new?contract=${contract.id}`;

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "Home", href: "/sub" }, { label: contract.trade }]}
        title={contract.trade}
        badge={<StatusPill status={contract.status} map={SUB_CONTRACT} />}
        description={`${formatCentsCompact(contract.contractSumCents)} subcontract with ${gc} on ${contract.project.name}.`}
        actions={
          <>
            {billing.billable && (
              <Link href={newHref} className={buttonVariants()}>
                Bill for {billing.periodMonth}
              </Link>
            )}
            {contract.documentId && (
              <a href={`/api/documents/${contract.documentId}`} target="_blank" rel="noreferrer" className={buttonVariants({ variant: "secondary" })}>
                <FileText aria-hidden />
                Signed subcontract (PDF)
              </a>
            )}
          </>
        }
      />
      <PageBody>
        {(justSubmitted || signed || msg) && (
          <div className="flex flex-col gap-2">
            {justSubmitted && (
              <Notice tone="settled" title={`Pay app #${justSubmitted.number} submitted for ${formatCents(justSubmitted.netDueBilledCents)}`}>
                {gc} reviews it next. Once it is approved and the owner pays, your payment appears below with a waiver to sign.
              </Notice>
            )}
            {signed && <Notice tone="settled" title="Waiver signed">Your payment can now be sent. Its steps are listed under Payments below.</Notice>}
            {msg && <Notice tone="info">{decodeURIComponent(msg)}</Notice>}
          </div>
        )}

        <Section
          data-tour="sub-rules"
          title="Payment rules"
          description={
            rules
              ? `What Groundwork read from your signed subcontract${active?.approvedAt ? ` and ${gc} approved on ${fullDay(active.approvedAt)}` : ""}. Every payment on this contract follows them.`
              : undefined
          }
        >
          {rules ? (
            <dl className="divide-y border-y">
              {rules.map((g) => (
                <div key={g.id} className="grid gap-x-6 gap-y-1 px-4 py-3 md:grid-cols-[12rem_minmax(0,1fr)]">
                  <dt className="text-sm leading-5 font-medium">{g.heading}</dt>
                  <dd className="flex flex-col gap-2">
                    {g.lines.map((l, i) => (
                      <div key={i}>
                        <p className="text-sm leading-5">{l.text}</p>
                        {l.quote && (
                          <p className="type-contract mt-0.5 text-muted-foreground">
                            “{l.quote.text}” <span className="type-caption whitespace-nowrap font-sans">Subcontract, page {l.quote.page}</span>
                          </p>
                        )}
                      </div>
                    ))}
                  </dd>
                </div>
              ))}
            </dl>
          ) : (
            <EmptyState
              align="start"
              title="The payment rules are not approved yet"
              description={`${gc} is checking the payment terms Groundwork read from your subcontract. They are listed here once approved.`}
            />
          )}
        </Section>

        <Section
          id="pay-apps"
          className="scroll-mt-16"
          title="Pay apps"
          description={billing.billable ? undefined : (billing.reason ?? undefined)}
          actions={
            billing.billable && apps.length > 0 ? (
              <Link href={newHref} className={buttonVariants({ variant: "secondary", size: "sm" })}>
                New pay app
              </Link>
            ) : undefined
          }
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Pay app</TableHead>
                <TableHead className="max-sm:hidden">Work through</TableHead>
                <TableHead className="max-sm:hidden">Status</TableHead>
                <TableHead numeric>Billed</TableHead>
                <TableHead numeric className="max-md:hidden">
                  Retainage
                </TableHead>
                <TableHead numeric className="max-sm:hidden">
                  Net due
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {apps.length === 0 && (
                <TableEmpty
                  colSpan={6}
                  action={
                    billing.billable ? (
                      <Link href={newHref} className={buttonVariants({ variant: "secondary", size: "sm" })}>
                        Bill for {billing.periodMonth}
                      </Link>
                    ) : undefined
                  }
                >
                  No pay apps yet.
                </TableEmpty>
              )}
              {apps.map((p) => (
                <TableRow key={p.id} id={`pay-app-${p.id}`} className="scroll-mt-16">
                  <TableCell>
                    <span className="font-medium">Pay app #{p.number}</span>
                    {p.isFinal && <span className="type-meta text-muted-foreground"> (final)</span>}
                    <div className="type-meta text-muted-foreground sm:hidden">Through {isoDay(p.periodThrough)}</div>
                    <div className="mt-1 sm:hidden">
                      <StatusPill status={p.status} map={PAY_APP} />
                    </div>
                    {p.status === "changes_requested" && (
                      <p className="type-meta mt-1 max-w-md text-hold">
                        {gc} sent this back{p.reviewNote ? `: “${p.reviewNote}”` : " for correction."} Corrected pay apps cannot be resubmitted in Groundwork yet, so contact them to agree the change.
                      </p>
                    )}
                  </TableCell>
                  <TableCell className="num max-sm:hidden">{isoDay(p.periodThrough)}</TableCell>
                  <TableCell className="max-sm:hidden">
                    <StatusPill status={p.status} map={PAY_APP} />
                  </TableCell>
                  <TableCell numeric className="max-sm:align-top">
                    {formatCents(p.workThisPeriodCents + p.storedMaterialsCents)}
                    <div className="type-meta text-muted-foreground sm:hidden">{formatCents(p.netDueApprovedCents ?? p.netDueBilledCents)} net</div>
                  </TableCell>
                  <TableCell numeric className="max-md:hidden">
                    {formatCents(p.retainageApprovedCents ?? p.retainageBilledCents)}
                  </TableCell>
                  <TableCell numeric className="max-sm:hidden">
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
                  <TableCell className="max-sm:hidden" />
                  <TableCell numeric>{formatCents(apps.reduce((s, p) => s + p.workThisPeriodCents + p.storedMaterialsCents, 0))}</TableCell>
                  <TableCell numeric className="max-md:hidden">
                    {formatCents(apps.reduce((s, p) => s + (p.retainageApprovedCents ?? p.retainageBilledCents), 0))}
                  </TableCell>
                  <TableCell numeric className="max-sm:hidden">
                    {formatCents(apps.reduce((s, p) => s + (p.netDueApprovedCents ?? p.netDueBilledCents), 0))}
                  </TableCell>
                </TableRow>
              </TableFoot>
            )}
          </Table>
        </Section>

        <Section id="payments" className="scroll-mt-16" title="Payments" description={releases.length ? "Each payment, step by step, with the date it is due." : undefined}>
          {releases.length === 0 && (
            <EmptyState
              align="start"
              title="No payments yet"
              description={`A payment is listed here when the owner pays ${gc} for a pay app you submitted.`}
            />
          )}
          {releases.map((r) => {
            const ex = explanations[r.id];
            const stale = ex && ex.status !== r.status;
            const signedWaivers = r.waivers.filter((w) => w.status === "signed");
            return (
              <Panel
                key={r.id}
                id={`release-${r.id}`}
                className="scroll-mt-16"
                title={
                  <>
                    {releaseLabel(r)} <span className="num ml-1 font-semibold">{formatCents(r.releaseCents)}</span>
                  </>
                }
                actions={<StatusPill status={r.status} map={RELEASE} />}
                footer={
                  <div className="flex flex-col gap-3">
                    {ex && !stale ? (
                      <div className="text-sm leading-5">
                        <p className="type-caption text-muted-foreground">{ex.model === "deterministic" ? "Explained from the payment record" : "Explained by Claude from the payment record"}</p>
                        <p className="mt-1">{ex.explanation}</p>
                        <p className="mt-1 text-muted-foreground">{ex.nextStep}</p>
                      </div>
                    ) : null}
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                      {(!ex || stale) && (
                        <form action={explainAction}>
                          <input type="hidden" name="releaseId" value={r.id} />
                          <Button type="submit" variant="secondary" size="sm">
                            Explain this payment
                          </Button>
                        </form>
                      )}
                      {signedWaivers.map((w) => (
                        <a key={w.id} href={`/api/waivers/${w.id}/pdf`} target="_blank" rel="noreferrer" className="type-meta text-link underline-offset-4 hover:underline">
                          Signed {isConditional(w.form) ? "conditional" : "unconditional"} waiver (PDF)
                        </a>
                      ))}
                    </div>
                  </div>
                }
              >
                <ReleaseTimeline r={r} ownerName={contract.project.owner.name} gcName={gc} nowIso={nowIso} signHref={(wid) => `/sub/waivers/${wid}/sign`} />
              </Panel>
            );
          })}
        </Section>

        {adjustments && <ContractAdjustments data={adjustments} role="payee" actions={{ proposeChangeOrder: requestChangeOrderAction, addLowerTier: addLowerTierAction }} />}
      </PageBody>
    </>
  );
}
