import Link from "next/link";
import { notFound } from "next/navigation";
import { FileUp } from "lucide-react";
import { isSampleWorkspace, requireAuth } from "@/server/auth";
import { getProjectBoard } from "@/server/scoped";
import { projectFlow } from "@/server/read/project";
import { gcAttention, gcSubcontractors } from "@/server/read/gc-lists";
import { STATE_LAW } from "@/domain/statutes";
import { formatCents, formatCentsCompact } from "@/lib/money";
import { now } from "@/server/clock";
import { releaseLabel } from "@/lib/release-label";
import { PageBody, PageHeader } from "@/components/page-header";
import { ProjectTabs } from "@/components/project-tabs";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Section } from "@/components/ui/panel";
import { Stat, StatGroup } from "@/components/ui/stat";
import { Table, TableBody, TableCaption, TableCell, TableFoot, TableHead, TableHeader, TableLink, TableRow } from "@/components/ui/table";
import { StatusPill, RELEASE } from "@/components/status-pill";
import { Countdown } from "@/components/countdown";
import { RecordOwnerPayment } from "@/components/record-owner-payment";
import { AddSubcontractForm } from "@/components/add-subcontract-form";
import { RevealRow, WaterfallReveal } from "@/components/waterfall-reveal";
import { MoneyFlow } from "@/components/viz/money-flow";
import { AttentionTable } from "../_components/attention-table";

const day = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
const dayYear = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
const endOfMonth = (d: Date, monthsAhead: number) => {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + monthsAhead + 1, 0));
  return x.toISOString().slice(0, 10);
};

/**
 * Project overview: the one money figure, what is waiting on the contractor, the money flow, and how
 * the latest owner payment was split. A project with no subcontracts shows the upload first and says
 * what the other sections will hold.
 */
export default async function ProjectPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ event?: string; duplicate?: string; created?: string; record?: string }> }) {
  const { id } = await params;
  const { event: highlighted, duplicate, created, record } = await searchParams;
  const { org } = await requireAuth("gc");
  const board = await getProjectBoard(org, id);
  if (!board) notFound();
  const { project, contracts, events, balances } = board;
  const sample = isSampleWorkspace(org);
  const nowDate = now();
  const nowIso = nowDate.toISOString();
  const law = STATE_LAW[project.state];
  const subName = (contractId: string) => contracts.find((c) => c.id === contractId)?.sub.name ?? "Subcontractor";
  const base = `/gc/projects/${id}`;

  const items = await gcAttention(org, id);
  const review = items.find((i) => i.kind === "pay_app");
  const rules = items.find((i) => i.kind === "rules");
  // The one primary action for where the project is now.
  const next = review ? { href: review.href, label: `Review ${review.subName}'s pay app` } : rules ? { href: rules.href, label: rules.status === "draft" ? `Read ${rules.subName}'s subcontract` : rules.status === "compiling" ? `Open ${rules.subName}'s subcontract` : `Approve ${rules.subName}'s payment rules` } : null;

  // Money owed to subcontractors right now, and the nearest deadline on it.
  const open = events.flatMap((e) => e.releases).filter((r) => !["paid", "settled"].includes(r.status) && r.releaseCents > 0);
  const owedCents = balances.sub_payable ?? 0;
  const nextDue = open.map((r) => r.payByAt).filter((d): d is Date => d !== null).sort((a, b) => a.getTime() - b.getTime())[0];
  const openSubs = new Set(open.map((r) => r.contractId)).size;
  const late = open.filter((r) => r.payByAt && r.payByAt < nowDate).length;

  const latest = events[0];
  const flow = events.length > 0 ? await projectFlow(org, id) : null;
  const landedAt = flow && highlighted ? flow.events.findIndex((e) => e.id === highlighted) : -1;
  const landed = highlighted && !duplicate ? events.find((e) => e.id === highlighted) : undefined;

  const recordDefaults = {
    amount: sample ? "125,000.00" : "",
    reference: sample ? `ACH BVH-${String(162 + events.length).padStart(4, "0")}` : "",
    periodThrough: latest ? endOfMonth(new Date(`${latest.periodThrough}T00:00:00Z`), 1) : sample ? "2026-09-30" : endOfMonth(nowDate, -1),
  };

  const header = (
    <PageHeader
      breadcrumbs={[{ label: "Projects", href: "/gc/projects" }, { label: project.name }]}
      title={project.name}
      badge={items.length > 0 ? <Badge tone="hold">{items.length} waiting</Badge> : undefined}
      description={
        <>
          {project.address ? `${project.address}. ` : ""}Owner {project.owner.name}. Prime contract <span className="num">{formatCentsCompact(project.primeContractSumCents)}</span>.
        </>
      }
      actions={
        contracts.length > 0 && (
          <>
            {next && (
              <Link href={next.href} className={buttonVariants({ variant: "primary" })}>
                {next.label}
              </Link>
            )}
            <RecordOwnerPayment projectId={project.id} defaults={recordDefaults} emphasis={!next} deadlineDays={law?.promptPay.days ?? null} defaultOpen={record === "1"} />
            <Link href={`${base}/subcontracts/new`} className={buttonVariants({ variant: "secondary" })}>
              <FileUp aria-hidden />
              Add subcontract
            </Link>
          </>
        )
      }
      tabs={<ProjectTabs projectId={project.id} />}
    />
  );

  const lawLine = law
    ? law.promptPay.days === null
      ? `${law.name} sets no deadline for paying subcontractors on private work, so each subcontract's own terms apply.`
      : `${law.name} gives you ${law.promptPay.days} days from each owner payment to pay subcontractors.`
    : null;

  // A new project: the upload takes the main position; the rest says what will appear and when.
  if (contracts.length === 0) {
    const known = (await gcSubcontractors(org)).map((s) => s.name);
    return (
      <>
        {header}
        <PageBody>
          {created && (
            <p role="status" className="text-sm text-muted-foreground">
              Project created. {lawLine}
            </p>
          )}
          <Section title="Upload the first subcontract" description="Groundwork reads its payment terms. You approve them." className="max-w-[640px]">
            <div className="border-t pt-5">
              <AddSubcontractForm projectId={id} knownSubs={known} isSample={sample} />
            </div>
          </Section>
          <div className="grid gap-4 md:grid-cols-3">
            <EmptyState align="start" title="Waiting on you" description="Appears once a subcontract is uploaded." />
            <EmptyState align="start" title="Owed to subcontractors" description="Appears with the first owner payment." />
            <EmptyState align="start" title="Money flow" description="Appears with the first owner payment." />
          </div>
        </PageBody>
      </>
    );
  }

  const released = latest?.releases.reduce((s, r) => s + r.releaseCents, 0) ?? 0;
  const funded = latest?.releases.reduce((s, r) => s + (r.kind === "retention" ? 0 : r.grossCents), 0) ?? 0;
  const held = latest?.releases.reduce((s, r) => s + (r.kind === "retention" ? 0 : r.retainageWithheldCents), 0) ?? 0;
  const setOff = latest?.releases.reduce((s, r) => s + r.offsetCents, 0) ?? 0;
  const unallocated = latest ? latest.amountCents - latest.retentionCents - latest.releases.reduce((s, r) => s + r.grossCents, 0) : 0;
  const active = !!latest && highlighted === latest.id && !duplicate;

  return (
    <>
      {header}
      <PageBody>
        {duplicate && (
          <p role="status" className="text-sm text-muted-foreground">
            That bank reference was already recorded, so nothing changed.
          </p>
        )}
        {landed && (
          <p role="status" className="text-sm">
            <span className="font-medium">
              <span className="num">{formatCents(landed.amountCents)}</span> recorded
            </span>{" "}
            <span className="text-muted-foreground">
              and split into {landed.releases.length} payment{landed.releases.length === 1 ? "" : "s"}. Each subcontractor has been asked for a lien waiver where one is required.
            </span>
          </p>
        )}

        {events.length > 0 && (
          <section aria-label="Money on this project" className="grid items-end gap-x-8 gap-y-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
            <dl>
              <Stat
                size="lg"
                label="Owed to subcontractors now"
                value={formatCents(owedCents)}
                hint={
                  owedCents === 0 ? (
                    "Every payment so far has been paid."
                  ) : (
                    <>
                      {open.length} payment{open.length === 1 ? "" : "s"} to {openSubs} subcontractor{openSubs === 1 ? "" : "s"}
                      {late > 0 ? <span className="font-medium text-destructive">, {late} past its deadline</span> : nextDue ? `, the first due ${day(nextDue)}` : ""}.
                    </>
                  )
                }
              />
            </dl>
            <StatGroup>
              <Stat label="Received from owner" value={formatCents(balances.owner_receipts ?? 0)} />
              <Stat label="Paid to subcontractors" value={formatCents(balances.sub_paid ?? 0)} />
              <Stat label="Retainage held" value={formatCents(balances.retainage_held ?? 0)} />
            </StatGroup>
          </section>
        )}

        <Section title="Waiting on you">
          <AttentionTable items={items} nowIso={nowIso} empty="Nothing is waiting on you on this project." />
        </Section>

        {events.length === 0 && (
          <EmptyState
            align="start"
            title="No owner payments yet"
            description={`Record an owner payment and Groundwork splits it.`}
          />
        )}

        {flow && (
          <Section
            title="Money flow"
            description="Owner on the left, subcontractors on the right. Width is dollars."
            actions={
              <Link href={`${base}/live`} className={buttonVariants({ variant: "secondary", size: "sm" })}>
                All charts
              </Link>
            }
          >
            <div className="border-t pt-5">
              <MoneyFlow flow={flow} height={300} autoPlay={landedAt >= 0 && !duplicate} playFrom={landedAt >= 0 ? Math.max(0, landedAt - 1) : undefined} />
            </div>
          </Section>
        )}

        {latest && (
          <Section
            title="Latest owner payment"
            description={
              <>
                <span className="num">{formatCents(latest.amountCents)}</span> received {day(latest.receivedAt)}, for work through {dayYear(latest.periodThrough)}. Reference <span className="type-mono text-xs">{latest.reference}</span>.
              </>
            }
            actions={
              <Link href={`${base}/payments`} className={buttonVariants({ variant: "secondary", size: "sm" })}>
                All payments
              </Link>
            }
          >
            <WaterfallReveal active={active}>
              <Table className="min-w-[900px]">
                <TableCaption>
                  {[
                    `${formatCents(released)} to subcontractors`,
                    held > 0 ? `${formatCents(held)} held as retainage` : null,
                    setOff > 0 ? `${formatCents(setOff)} set off as backcharges` : null,
                    latest.retentionCents > 0 ? `${formatCents(latest.retentionCents)} was the owner releasing retention` : null,
                    unallocated > 0 ? `${formatCents(unallocated)} not yet matched to a pay app` : null,
                  ]
                    .filter(Boolean)
                    .join(", ")}
                  . {lawLine}
                </TableCaption>
                <TableHeader>
                  <TableRow>
                    <TableHead>Subcontractor</TableHead>
                    <TableHead>For</TableHead>
                    <TableHead numeric>Funded</TableHead>
                    <TableHead numeric>Retainage</TableHead>
                    <TableHead numeric>Paid out</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Deadline</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {latest.releases.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-muted-foreground">
                        No approved pay app was waiting for this money, so none of it has been split yet.
                      </TableCell>
                    </TableRow>
                  )}
                  {latest.releases.map((r, i) => (
                    <RevealRow key={r.id} index={i} active={active}>
                      <TableCell>
                        <TableLink href={`/gc/releases/${r.id}`} className="whitespace-nowrap">
                          {subName(r.contractId)}
                        </TableLink>
                      </TableCell>
                      <TableCell muted className="whitespace-nowrap">
                        {releaseLabel(r)}
                        {r.awaitingOwnerCents > 0 && (
                          <div className="text-xs">
                            <span className="type-mono">{formatCents(r.awaitingOwnerCents)}</span> still with the owner
                          </div>
                        )}
                      </TableCell>
                      <TableCell numeric>{r.kind === "retention" ? "" : formatCents(r.grossCents)}</TableCell>
                      <TableCell numeric className="text-muted-foreground">
                        {r.kind === "retention" ? "released" : r.retainageWithheldCents ? `−${formatCents(r.retainageWithheldCents)}` : formatCents(0)}
                      </TableCell>
                      <TableCell numeric className="font-medium">
                        {formatCents(r.releaseCents)}
                        {r.offsetCents > 0 && <div className="font-sans text-xs font-normal text-muted-foreground">after a {formatCents(r.offsetCents)} backcharge</div>}
                      </TableCell>
                      <TableCell>
                        <StatusPill status={r.status} map={RELEASE} />
                      </TableCell>
                      <TableCell>
                        <Countdown deadline={r.payByAt?.toISOString() ?? null} amountCents={r.releaseCents} settled={r.status === "paid" || r.status === "settled"} nowIso={nowIso} label="Pay by" />
                      </TableCell>
                    </RevealRow>
                  ))}
                </TableBody>
                {latest.releases.length > 1 && (
                  <TableFoot>
                    <TableRow>
                      <TableCell colSpan={2}>Total</TableCell>
                      <TableCell numeric>{formatCents(funded)}</TableCell>
                      <TableCell numeric>{held > 0 ? `−${formatCents(held)}` : formatCents(0)}</TableCell>
                      <TableCell numeric>{formatCents(released)}</TableCell>
                      <TableCell colSpan={2} />
                    </TableRow>
                  </TableFoot>
                )}
              </Table>
            </WaterfallReveal>
          </Section>
        )}
      </PageBody>
    </>
  );
}
