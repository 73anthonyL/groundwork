import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAuth } from "@/server/auth";
import { getProjectBoard } from "@/server/scoped";
import { projectFlow } from "@/server/read/project";
import { STATE_LAW } from "@/domain/statutes";
import { formatCentsCompact, formatCents } from "@/lib/money";
import { now } from "@/server/clock";
import { releaseLabel } from "@/lib/release-label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusPill, RELEASE } from "@/components/status-pill";
import { Countdown } from "@/components/countdown";
import { RecordOwnerPayment } from "@/components/record-owner-payment";
import { RevealRow, WaterfallReveal } from "@/components/waterfall-reveal";
import { ProjectTabs } from "@/components/project-tabs";
import { MoneyFlow } from "@/components/viz/money-flow";
import { ProjectSteps, type ProjectStep } from "@/components/project-steps";
import { buttonVariants } from "@/components/ui/button";

const day = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
const dayYear = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

/** Every payment table shares these column widths, so figures line up down the whole page. */
const COLS = ["", "w-[13%]", "w-[13%]", "w-[15%]", "w-[19%]", "w-[21%]"];

export default async function ProjectPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ event?: string; duplicate?: string }> }) {
  const { id } = await params;
  const { event: highlighted, duplicate } = await searchParams;
  const { org } = await requireAuth("gc");
  const board = await getProjectBoard(org, id);
  if (!board) notFound();
  const { project, contracts, events, balances } = board;
  const nowDate = now();
  const nowIso = nowDate.toISOString();
  const law = STATE_LAW[project.state];
  const subName = (contractId: string) => contracts.find((c) => c.id === contractId)?.sub.name ?? "Subcontractor";
  const toReview = contracts.flatMap((c) => c.payApplications.filter((p) => p.status === "submitted").map((p) => ({ ...p, sub: c.sub.name })));
  const toCompile = contracts.filter((c) => c.status !== "active");
  const nextPeriod = (() => {
    const last = events[0]?.periodThrough;
    if (!last) return "2026-09-30";
    const d = new Date(`${last}T00:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() + 2, 0);
    return d.toISOString().slice(0, 10);
  })();

  // The one figure this page is about: money owed to subs right now, and the nearest deadline on it.
  const open = events.flatMap((e) => e.releases).filter((r) => !["paid", "settled"].includes(r.status) && r.releaseCents > 0);
  const owedCents = balances.sub_payable ?? 0;
  const nextDue = open.map((r) => r.payByAt).filter((d): d is Date => d !== null).sort((a, b) => a.getTime() - b.getTime())[0];
  const openSubs = new Set(open.map((r) => r.contractId)).size;
  const late = open.filter((r) => r.payByAt && r.payByAt < nowDate).length;

  // Where this project is in the process, and the one thing to do next.
  const approved = contracts.filter((c) => c.status === "active");
  const allApps = contracts.flatMap((c) => c.payApplications);
  const allReleases = events.flatMap((e) => e.releases);
  const steps: ProjectStep[] = [
    {
      title: "Add a subcontract",
      body: "You upload the signed contract PDF.",
      done: contracts.length > 0,
      action: { href: `/gc/projects/${id}/subcontracts/new`, label: "Add a subcontract" },
    },
    {
      title: "Approve its payment rules",
      body: "Claude reads the payment terms. You check them against the contract and approve once.",
      done: contracts.length > 0 && toCompile.length === 0,
      action: toCompile[0] ? { href: `/gc/contracts/${toCompile[0].id}`, label: `Review ${toCompile[0].sub.name}` } : undefined,
    },
    {
      title: "The sub bills, you review",
      body: "Each subcontractor sends a pay application. Groundwork checks the math.",
      done: allApps.length > 0 && toReview.length === 0 && approved.length > 0,
      action: toReview[0] ? { href: `/gc/pay-apps/${toReview[0].id}`, label: `Review ${toReview[0].sub}'s bill` } : undefined,
    },
    {
      title: "Record the owner's payment",
      body: "Groundwork splits it between the subs, holds retainage and starts each deadline.",
      done: events.length > 0,
      action: { href: "#payments-heading", label: "Record a payment" },
    },
    {
      title: "Subs sign, money goes out",
      body: "Each sub signs a lien waiver, then their payment is sent.",
      done: allReleases.length > 0 && open.length === 0,
      action: open[0] ? { href: `/gc/releases/${open[0].id}`, label: "See what's waiting" } : undefined,
    },
  ];

  // Just recorded a payment: play the project's money from the moment before it landed.
  const flow = highlighted ? await projectFlow(org, id) : null;
  const landedAt = flow ? flow.events.findIndex((e) => e.id === highlighted) : -1;

  return (
    <div>
      <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
        <div className="min-w-0">
          <h1 className="text-[2rem] font-semibold leading-tight">{project.name}</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {project.address}. Owner {project.owner.name}, prime contract <span className="num">{formatCentsCompact(project.primeContractSumCents)}</span>.
          </p>
        </div>
        <ProjectTabs projectId={project.id} active="board" />
      </header>

      {/* What is owed now, then the three figures that explain it. No boxes: size carries the order. */}
      <section aria-label="Where the project's money stands" className="mt-10 flex flex-wrap items-end justify-between gap-x-12 gap-y-8 border-b pb-10">
        <div>
          <div className="text-sm text-muted-foreground">Owed to subcontractors now</div>
          <div className="type-numeral mt-2 text-6xl font-semibold tracking-tight">{formatCentsCompact(owedCents)}</div>
          <p className="mt-3 text-sm">
            {owedCents === 0 ? (
              <span className="text-muted-foreground">Every release has been paid.</span>
            ) : (
              <>
                {open.length} release{open.length === 1 ? "" : "s"} to {openSubs} subcontractor{openSubs === 1 ? "" : "s"}
                {late > 0 ? <span className="font-medium text-destructive">, {late} past its deadline</span> : nextDue ? <span className="text-muted-foreground">, the first due {day(nextDue)}</span> : null}
              </>
            )}
          </p>
        </div>
        <dl className="num grid grid-cols-3 gap-x-10 text-sm">
          {[
            ["Received from owner", balances.owner_receipts ?? 0],
            ["Paid to subcontractors", balances.sub_paid ?? 0],
            ["Retainage held", balances.retainage_held ?? 0],
          ].map(([label, cents]) => (
            <div key={label as string}>
              <dt className="font-sans text-muted-foreground">{label}</dt>
              <dd className="mt-1 text-xl font-semibold">{formatCentsCompact(cents as number)}</dd>
            </div>
          ))}
        </dl>
      </section>

      <ProjectSteps steps={steps} />

      {(toReview.length > 0 || toCompile.length > 0) && (
        <ul className="mt-4 space-y-2 text-sm" aria-label="Waiting on you">
          {toReview.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-4 rounded-lg bg-hold-soft px-4 py-2.5">
              <span>
                {p.sub} submitted pay application #{p.number}. It is waiting for your review.
              </span>
              <Link href={`/gc/pay-apps/${p.id}`} className={buttonVariants({ variant: "outline", size: "sm", className: "shrink-0" })} style={{ background: "var(--card)" }}>
                Review it
              </Link>
            </li>
          ))}
          {toCompile.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-4 rounded-lg bg-hold-soft px-4 py-2.5">
              <span>
                {c.sub.name}&rsquo;s subcontract {c.status === "draft" ? "has not been read into payment rules yet" : "has payment rules waiting for your approval"}. Nothing can be paid on it until then.
              </span>
              <Link href={`/gc/contracts/${c.id}`} className={buttonVariants({ variant: "outline", size: "sm", className: "shrink-0" })} style={{ background: "var(--card)" }}>
                {c.status === "draft" ? "Read it" : "Review the rules"}
              </Link>
            </li>
          ))}
        </ul>
      )}

      {flow && landedAt >= 0 && !duplicate && (
        <section aria-label="The payment that just landed" className="mt-8 rounded-xl bg-card p-6 shadow-card">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-base font-semibold">
              {formatCentsCompact(flow.events[landedAt].amountCents)} just landed. Here is where it goes.
            </h2>
            <Link href={`/gc/projects/${id}/live`} className="text-sm text-link hover:underline">
              Open the live view
            </Link>
          </div>
          <div className="mt-4">
            <MoneyFlow flow={flow} height={340} autoPlay playFrom={Math.max(0, landedAt - 1)} />
          </div>
        </section>
      )}

      <section className="mt-12" aria-labelledby="payments-heading">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 id="payments-heading" className="scroll-mt-20 text-xl font-semibold">
              Owner payments
            </h2>
            <p className="mt-1 max-w-xl text-sm text-muted-foreground">
              Each payment is split by the approved rules the moment it is recorded.
              {law?.promptPay.days != null ? ` ${law.name} gives you ${law.promptPay.days} days from receipt to pay each subcontractor.` : ""}
            </p>
          </div>
          <RecordOwnerPayment projectId={project.id} defaults={{ amount: "125,000.00", reference: `ACH BVH-${String(162 + events.length).padStart(4, "0")}`, periodThrough: nextPeriod }} />
        </div>
        {duplicate && (
          <p role="status" className="mt-3 text-sm text-muted-foreground">
            That payment was already recorded, so nothing changed.
          </p>
        )}
        {events.length === 0 ? (
          <div className="mt-6 rounded-xl bg-card px-6 py-10 text-center shadow-card">
            <p className="font-medium">No owner payments yet</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">When the owner&rsquo;s money arrives, record it here. Groundwork splits it across every approved pay application and starts each subcontractor&rsquo;s clock.</p>
          </div>
        ) : (
          <div className="mt-6 space-y-5">
            {events.map((e) => {
              const released = e.releases.reduce((s, r) => s + r.releaseCents, 0);
              const held = e.releases.reduce((s, r) => s + (r.kind === "retention" ? 0 : r.retainageWithheldCents), 0);
              const funded = e.releases.reduce((s, r) => s + r.grossCents, 0);
              const setOff = e.releases.reduce((s, r) => s + r.offsetCents, 0);
              const unallocated = e.amountCents - e.retentionCents - funded;
              const active = highlighted === e.id;
              const parts = [
                `${formatCentsCompact(released)} to subcontractors`,
                held > 0 ? `${formatCentsCompact(held)} held as retainage` : null,
                setOff > 0 ? `${formatCentsCompact(setOff)} set off as backcharges` : null,
                e.retentionCents > 0 ? `${formatCentsCompact(e.retentionCents)} was the owner releasing retention` : null,
                unallocated > 0 ? `${formatCentsCompact(unallocated)} not yet matched to a pay application` : null,
              ].filter(Boolean);
              return (
                <WaterfallReveal key={e.id} active={active}>
                  <article className={`overflow-hidden rounded-xl bg-card shadow-card ${active ? "ring-2 ring-link" : ""}`}>
                    <header className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 px-4 pb-3 pt-4">
                      <h3 className="flex items-baseline gap-3">
                        <span className="num text-xl font-semibold">{formatCentsCompact(e.amountCents)}</span>
                        <span className="text-sm font-normal text-muted-foreground">
                          received {day(e.receivedAt)}, work through {dayYear(e.periodThrough)}
                        </span>
                      </h3>
                      <span className="num text-xs text-muted-foreground">{e.reference}</span>
                    </header>
                    <Table className="table-fixed">
                      <colgroup>
                        {COLS.map((w, i) => (
                          <col key={i} className={w} />
                        ))}
                      </colgroup>
                      <TableHeader>
                        <TableRow className="hover:bg-transparent">
                          <TableHead>Subcontractor</TableHead>
                          <TableHead className="text-right">Funded</TableHead>
                          <TableHead className="text-right">Retainage</TableHead>
                          <TableHead className="text-right">Paid Out</TableHead>
                          <TableHead className="pl-8">Status</TableHead>
                          <TableHead>Deadline</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {e.releases.map((r, i) => (
                          <RevealRow key={r.id} index={i} active={active}>
                            <TableCell>
                              <Link href={`/gc/releases/${r.id}`} className="font-medium text-link hover:underline">
                                {subName(r.contractId)}
                              </Link>
                              <div className="text-xs text-muted-foreground">
                                {releaseLabel(r)}
                                {r.awaitingOwnerCents > 0 ? `, ${formatCentsCompact(r.awaitingOwnerCents)} still with the owner` : ""}
                              </div>
                            </TableCell>
                            <TableCell className="num text-right">{r.kind === "retention" ? <span className="text-muted-foreground">none</span> : formatCents(r.grossCents)}</TableCell>
                            <TableCell className="num text-right text-muted-foreground">{r.kind === "retention" ? "released" : r.retainageWithheldCents ? `−${formatCents(r.retainageWithheldCents)}` : "none"}</TableCell>
                            <TableCell className="num text-right font-semibold">
                              {formatCents(r.releaseCents)}
                              {r.offsetCents > 0 && <div className="text-xs font-normal text-muted-foreground">after a {formatCents(r.offsetCents)} backcharge</div>}
                            </TableCell>
                            <TableCell className="pl-8">
                              <StatusPill status={r.status} map={RELEASE} />
                            </TableCell>
                            <TableCell>
                              <Countdown deadline={r.payByAt?.toISOString() ?? null} amountCents={r.releaseCents} settled={r.status === "paid" || r.status === "settled"} nowIso={nowIso} label="Due" />
                            </TableCell>
                          </RevealRow>
                        ))}
                      </TableBody>
                    </Table>
                    <p className="num border-t px-4 py-2.5 text-xs text-muted-foreground">{parts.join(", ")}.</p>
                  </article>
                </WaterfallReveal>
              );
            })}
          </div>
        )}
      </section>

      <section className="mt-14" aria-labelledby="contracts-heading">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 id="contracts-heading" className="text-xl font-semibold">
              Subcontracts
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {contracts.length} contract{contracts.length === 1 ? "" : "s"} worth <span className="num">{formatCentsCompact(contracts.reduce((s, c) => s + c.contractSumCents, 0))}</span>. Click a subcontractor to see its payment rules.
            </p>
          </div>
          <Link href={`/gc/projects/${id}/subcontracts/new`} className={buttonVariants({ variant: "outline" })} style={{ background: "var(--card)" }}>
            Add a subcontract
          </Link>
        </div>
        <div className="mt-5 overflow-hidden rounded-xl bg-card shadow-card">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Subcontractor</TableHead>
                <TableHead>Trade</TableHead>
                <TableHead className="text-right">Contract Sum</TableHead>
                <TableHead className="pl-8">Payment Rules</TableHead>
                <TableHead>Pay Applications</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {contracts.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <Link href={`/gc/contracts/${c.id}`} className="font-medium text-link hover:underline">
                      {c.sub.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{c.trade}</TableCell>
                  <TableCell className="num text-right">{formatCentsCompact(c.contractSumCents)}</TableCell>
                  <TableCell className="pl-8">
                    <StatusPill status={c.status} />
                  </TableCell>
                  <TableCell className="text-sm">
                    {c.payApplications.length === 0 ? (
                      <span className="text-muted-foreground">None yet</span>
                    ) : (
                      c.payApplications.map((p) => (
                        <Link key={p.id} href={`/gc/pay-apps/${p.id}`} className="num mr-3 text-link hover:underline">
                          #{p.number}
                        </Link>
                      ))
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>
    </div>
  );
}
