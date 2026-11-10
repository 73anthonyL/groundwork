import { notFound } from "next/navigation";
import { isSampleWorkspace, requireAuth } from "@/server/auth";
import { getProjectBoard } from "@/server/scoped";
import { STATE_LAW } from "@/domain/statutes";
import { formatCents } from "@/lib/money";
import { now } from "@/server/clock";
import { releaseLabel } from "@/lib/release-label";
import { PageBody, PageHeader } from "@/components/page-header";
import { ProjectTabs } from "@/components/project-tabs";
import { EmptyState } from "@/components/ui/empty-state";
import { Section } from "@/components/ui/panel";
import { Table, TableBody, TableCaption, TableCell, TableFoot, TableHead, TableHeader, TableLink, TableRow } from "@/components/ui/table";
import { StatusPill, RELEASE } from "@/components/status-pill";
import { Countdown } from "@/components/countdown";
import { RecordOwnerPayment } from "@/components/record-owner-payment";
import { RevealRow, WaterfallReveal } from "@/components/waterfall-reveal";

export const metadata = { title: "Payments" };

const day = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
const isoDay = (iso: string) => day(new Date(`${iso}T00:00:00`));
const endOfMonth = (d: Date, monthsAhead: number) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + monthsAhead + 1, 0)).toISOString().slice(0, 10);
const less = (cents: number) => (cents > 0 ? `−${formatCents(cents)}` : formatCents(0));

/** One project's owner payments, newest first, each with how it was split between subcontractors. */
export default async function ProjectPaymentsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ event?: string }> }) {
  const { id } = await params;
  const { event: highlighted } = await searchParams;
  const { org } = await requireAuth("gc");
  const board = await getProjectBoard(org, id);
  if (!board) notFound();
  const { project, contracts, events } = board;
  const nowDate = now();
  const nowIso = nowDate.toISOString();
  const law = STATE_LAW[project.state];
  const sample = isSampleWorkspace(org);
  const subName = (contractId: string) => contracts.find((c) => c.id === contractId)?.sub.name ?? "Subcontractor";
  const approved = contracts.some((c) => c.status === "active");
  const latest = events[0];
  const defaults = {
    amount: sample ? "125,000.00" : "",
    reference: sample ? `ACH BVH-${String(162 + events.length).padStart(4, "0")}` : "",
    periodThrough: latest ? endOfMonth(new Date(`${latest.periodThrough}T00:00:00Z`), 1) : sample ? "2026-09-30" : endOfMonth(nowDate, -1),
  };
  const lawLine = law ? (law.promptPay.days === null ? `${law.name} sets no deadline for paying subcontractors on private work, so each subcontract's own terms apply.` : `${law.name} gives you ${law.promptPay.days} days from each owner payment to pay subcontractors.`) : null;

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "Projects", href: "/gc/projects" }, { label: project.name, href: `/gc/projects/${id}` }, { label: "Payments" }]}
        title={project.name}
        actions={contracts.length > 0 && <RecordOwnerPayment projectId={project.id} defaults={defaults} emphasis deadlineDays={law?.promptPay.days ?? null} />}
        tabs={<ProjectTabs projectId={id} />}
      />
      <PageBody>
        {events.length === 0 ? (
          <EmptyState
            title="No owner payments yet"
            description={
              contracts.length === 0
                ? "Owner payments and how each one is split appear here once the project has a subcontract with approved payment rules."
                : approved
                  ? `When the owner's money arrives, record it here. Groundwork splits it across the approved pay apps, holds retainage, asks for lien waivers and starts each subcontractor's deadline. ${lawLine ?? ""}`
                  : "Approve a subcontract's payment rules first. Then each owner payment you record is split here by those rules."
            }
          />
        ) : (
          <>
            {lawLine && <p className="text-muted-foreground">Each owner payment is split by the approved payment rules the moment it is recorded. {lawLine}</p>}
            {events.map((e) => {
              const released = e.releases.reduce((s, r) => s + r.releaseCents, 0);
              const held = e.releases.reduce((s, r) => s + (r.kind === "retention" ? 0 : r.retainageWithheldCents), 0);
              const funded = e.releases.reduce((s, r) => s + (r.kind === "retention" ? 0 : r.grossCents), 0);
              const setOff = e.releases.reduce((s, r) => s + r.offsetCents, 0);
              const unallocated = e.amountCents - e.retentionCents - funded;
              const active = highlighted === e.id;
              const notes = [
                e.retentionCents > 0 ? `${formatCents(e.retentionCents)} of this payment was the owner releasing retainage.` : null,
                unallocated > 0 ? `${formatCents(unallocated)} is not matched to an approved pay app yet and stays with you until one is.` : null,
              ].filter(Boolean);
              return (
                <Section
                  key={e.id}
                  id={`owner-payment-${e.id}`}
                  className="scroll-mt-20"
                  title={
                    <>
                      <span className="num">{formatCents(e.amountCents)}</span> received {day(e.receivedAt)}
                    </>
                  }
                  description={
                    <>
                      Reference <span className="type-mono">{e.reference}</span>, for work through {isoDay(e.periodThrough)}
                    </>
                  }
                >
                  <WaterfallReveal active={active}>
                    <Table className="min-w-[860px]">
                      {notes.length > 0 && <TableCaption>{notes.join(" ")}</TableCaption>}
                      <TableHeader>
                        <TableRow>
                          <TableHead>Subcontractor</TableHead>
                          <TableHead numeric>Funded</TableHead>
                          <TableHead numeric>Retainage</TableHead>
                          <TableHead numeric>Backcharge</TableHead>
                          <TableHead numeric>Paid out</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Deadline</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {e.releases.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={7} className="text-muted-foreground">
                              Nothing was paid out of this payment: no approved pay app was waiting for it.
                            </TableCell>
                          </TableRow>
                        )}
                        {e.releases.map((r, i) => (
                          <RevealRow key={r.id} index={i} active={active}>
                            <TableCell>
                              <TableLink href={`/gc/releases/${r.id}`} className="whitespace-nowrap">
                                {subName(r.contractId)}
                              </TableLink>
                              <span className="type-meta ml-2 whitespace-nowrap text-muted-foreground">{releaseLabel(r)}</span>
                            </TableCell>
                            <TableCell numeric>{r.kind === "retention" ? "" : formatCents(r.grossCents)}</TableCell>
                            <TableCell numeric className="text-muted-foreground">
                              {r.kind === "retention" ? "released" : less(r.retainageWithheldCents)}
                            </TableCell>
                            <TableCell numeric className="text-muted-foreground">
                              {less(r.offsetCents)}
                            </TableCell>
                            <TableCell numeric className="font-medium">
                              {formatCents(r.releaseCents)}
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
                      {e.releases.length > 1 && (
                        <TableFoot>
                          <TableRow>
                            <TableCell>Total</TableCell>
                            <TableCell numeric>{formatCents(funded)}</TableCell>
                            <TableCell numeric>{less(held)}</TableCell>
                            <TableCell numeric>{less(setOff)}</TableCell>
                            <TableCell numeric>{formatCents(released)}</TableCell>
                            <TableCell colSpan={2} />
                          </TableRow>
                        </TableFoot>
                      )}
                    </Table>
                  </WaterfallReveal>
                </Section>
              );
            })}
          </>
        )}
      </PageBody>
    </>
  );
}
