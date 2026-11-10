import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAuth } from "@/server/auth";
import { getProjectBoard } from "@/server/scoped";
import { formatBps, formatCentsCompact, formatCents } from "@/lib/money";
import { now } from "@/server/clock";
import { releaseLabel } from "@/lib/release-label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusPill, RELEASE } from "@/components/status-pill";
import { Countdown } from "@/components/countdown";
import { RecordOwnerPayment } from "@/components/record-owner-payment";
import { CountUp, RevealRow, WaterfallReveal } from "@/components/waterfall-reveal";

function fmtDate(iso: string) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
function fmtDateTime(d: Date) {
  return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export default async function ProjectPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ event?: string; duplicate?: string }> }) {
  const { id } = await params;
  const { event: highlighted, duplicate } = await searchParams;
  const { org } = await requireAuth("gc");
  const board = await getProjectBoard(org, id);
  if (!board) notFound();
  const { project, contracts, events, balances } = board;
  const committed = contracts.reduce((s, c) => s + c.contractSumCents, 0);
  const nowIso = now().toISOString();
  const subName = (contractId: string) => contracts.find((c) => c.id === contractId)?.sub.name ?? "Subcontractor";
  const openPayApps = contracts.flatMap((c) => c.payApplications.filter((p) => p.status === "submitted").map((p) => ({ ...p, sub: c.sub.name })));
  const nextPeriod = (() => {
    const last = events[0]?.periodThrough;
    if (!last) return "2026-09-30";
    const d = new Date(`${last}T00:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() + 2, 0);
    return d.toISOString().slice(0, 10);
  })();

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-sm text-muted-foreground">{project.address}</div>
          <h1 className="mt-1 text-3xl font-semibold">{project.name}</h1>
        </div>
        <dl className="grid grid-cols-2 gap-x-8 gap-y-1 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-muted-foreground">Owner</dt>
            <dd className="font-medium">{project.owner.name}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Prime contract</dt>
            <dd className="num font-medium">{formatCentsCompact(project.primeContractSumCents)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Contract date</dt>
            <dd className="font-medium">{fmtDate(project.contractDate)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Retention cap</dt>
            <dd className="font-medium">{project.retentionCapBps ? `${formatBps(project.retentionCapBps)} · Civ. Code §8811` : "None · predates §8811"}</dd>
          </div>
        </dl>
      </div>

      {/* Balances: the ledger, summed. */}
      <dl className="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-md border bg-border sm:grid-cols-5">
        {[
          ["Owner paid to date", balances.owner_receipts ?? 0, ""],
          ["Released to subs", balances.sub_paid ?? 0, "text-settled"],
          ["Owed to subs now", balances.sub_payable ?? 0, "text-money"],
          ["Retainage held", balances.retainage_held ?? 0, "text-hold"],
          ["GC cash from owner", balances.gc_cash ?? 0, ""],
        ].map(([label, cents, tone]) => (
          <div key={label as string} className="bg-card p-4">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className={`num mt-1 text-lg font-semibold ${tone}`}>{formatCentsCompact(cents as number)}</dd>
          </div>
        ))}
      </dl>

      {openPayApps.length > 0 && (
        <div className="mt-6 flex items-center justify-between rounded-md border border-hold/40 bg-hold-soft px-4 py-3 text-sm">
          <span>
            <span className="font-medium">{openPayApps.length} pay application{openPayApps.length > 1 ? "s" : ""} waiting for review:</span>{" "}
            {openPayApps.map((p) => (
              <Link key={p.id} href={`/gc/pay-apps/${p.id}`} className="underline underline-offset-2">
                {p.sub} #{p.number}
              </Link>
            ))}
          </span>
        </div>
      )}

      <section className="mt-10" aria-labelledby="waterfall-heading">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 id="waterfall-heading" className="text-xl font-semibold">
              Waterfall
            </h2>
            <p className="text-sm text-muted-foreground">Every owner payment, split by the approved rules, with the clock the law puts on it.</p>
          </div>
          <RecordOwnerPayment projectId={project.id} defaults={{ amount: "125,000.00", reference: `ACH BVH-${String(162 + events.length).padStart(4, "0")}`, periodThrough: nextPeriod }} />
        </div>
        {duplicate && (
          <p role="status" className="mt-3 text-sm text-muted-foreground">
            That payment was already recorded; nothing changed.
          </p>
        )}
        {events.length === 0 ? (
          <div className="mt-4 rounded-md border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">
            No owner payments yet. When the owner&rsquo;s money lands, record it here and the engine allocates it to every approved pay application.
          </div>
        ) : (
          <div className="mt-4 space-y-6">
            {events.map((e) => {
              const released = e.releases.reduce((s, r) => s + r.releaseCents, 0);
              const held = e.releases.reduce((s, r) => s + r.retainageWithheldCents, 0);
              const unallocated = e.amountCents - released - held;
              const active = highlighted === e.id;
              return (
                <WaterfallReveal key={e.id} active={active}>
                <article className={`overflow-hidden rounded-md border bg-card ${active ? "ring-2 ring-money" : ""}`}>
                  <header className="flex flex-wrap items-baseline justify-between gap-3 border-b bg-surface-sunken/60 px-4 py-3">
                    <div className="flex items-baseline gap-3">
                      <span className="num text-xl font-semibold text-money">
                        <CountUp cents={e.amountCents} active={active} />
                      </span>
                      <span className="text-sm">
                        from {project.owner.name} · {e.reference} · received {fmtDateTime(e.receivedAt)}
                      </span>
                    </div>
                    <div className="num text-sm text-muted-foreground">
                      through {fmtDate(e.periodThrough)} · released {formatCentsCompact(released)} · retainage {formatCentsCompact(held)}
                      {unallocated > 0 ? ` · unallocated ${formatCentsCompact(unallocated)}` : ""}
                    </div>
                  </header>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Subcontractor</TableHead>
                        <TableHead className="text-right">Gross funded</TableHead>
                        <TableHead className="text-right">Retainage</TableHead>
                        <TableHead className="text-right">Release</TableHead>
                        <TableHead className="text-right">Awaiting owner</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Clock</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {e.releases.map((r, i) => (
                        <RevealRow key={r.id} index={i} active={active}>
                          <TableCell>
                            <Link href={`/gc/releases/${r.id}`} className="font-medium hover:underline">
                              {subName(r.contractId)}
                            </Link>
                            <div className="text-xs text-muted-foreground">{releaseLabel(r)}</div>
                          </TableCell>
                          <TableCell className="num text-right">{formatCents(r.grossCents)}</TableCell>
                          <TableCell className="num text-right text-hold">−{formatCents(r.retainageWithheldCents)}</TableCell>
                          <TableCell className="num text-right font-semibold">{formatCents(r.releaseCents)}</TableCell>
                          <TableCell className="num text-right text-muted-foreground">{r.awaitingOwnerCents ? formatCents(r.awaitingOwnerCents) : "—"}</TableCell>
                          <TableCell>
                            <StatusPill status={r.status} map={RELEASE} />
                          </TableCell>
                          <TableCell>
                            <Countdown deadline={r.payByAt?.toISOString() ?? null} amountCents={r.releaseCents} settled={r.status === "paid" || r.status === "settled"} nowIso={nowIso} />
                          </TableCell>
                        </RevealRow>
                      ))}
                    </TableBody>
                  </Table>
                </article>
                </WaterfallReveal>
              );
            })}
          </div>
        )}
      </section>

      <section className="mt-10" aria-labelledby="contracts-heading">
        <div className="flex items-baseline justify-between">
          <h2 id="contracts-heading" className="text-xl font-semibold">
            Subcontracts
          </h2>
          <div className="text-sm text-muted-foreground">
            {contracts.length} contracts · <span className="num">{formatCentsCompact(committed)}</span> committed
          </div>
        </div>
        <div className="mt-4 overflow-hidden rounded-md border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Subcontractor</TableHead>
                <TableHead>Trade</TableHead>
                <TableHead className="text-right">Contract sum</TableHead>
                <TableHead>Executed</TableHead>
                <TableHead>Payment rules</TableHead>
                <TableHead>Pay apps</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {contracts.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <Link href={`/gc/contracts/${c.id}`} className="font-medium hover:underline">
                      {c.sub.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{c.trade}</TableCell>
                  <TableCell className="num text-right">{formatCentsCompact(c.contractSumCents)}</TableCell>
                  <TableCell className="text-muted-foreground">{fmtDate(c.executedOn)}</TableCell>
                  <TableCell>
                    <StatusPill status={c.status} />
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {c.payApplications.length === 0
                      ? "None yet"
                      : c.payApplications.map((p) => (
                          <Link key={p.id} href={`/gc/pay-apps/${p.id}`} className="mr-2 underline-offset-2 hover:underline">
                            #{p.number}
                          </Link>
                        ))}
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
