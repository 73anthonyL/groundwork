import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import { requireAuth } from "@/server/auth";
import { getPayApp } from "@/server/scoped";
import { formatCents, formatCentsCompact, formatBps } from "@/lib/money";
import type { Check } from "@/domain/payapp/checks";
import type { PayAppFlag } from "@/lib/ai/flagPayApp";
import { fieldLabel } from "@/server/rules/review";
import type { RuleFieldPath } from "@/domain/rules/schema";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusPill, PAY_APP } from "@/components/status-pill";
import { Button } from "@/components/ui/button";
import { reviewPayAppAction } from "./actions";

export default async function PayAppReviewPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; done?: string }> }) {
  const { id } = await params;
  const { error, done } = await searchParams;
  const { org } = await requireAuth("gc");
  const app = await getPayApp(org, id);
  if (!app) notFound();
  const checks = app.checks as Check[];
  const flags = app.flags as PayAppFlag[];
  const failing = checks.filter((c) => c.status === "fail");
  const onlyRetainage = failing.length === 1 && failing[0].id === "retainage_rate" && failing[0].correction;
  const gross = app.workThisPeriodCents + app.storedMaterialsCents;
  const reviewable = app.status === "submitted" || app.status === "changes_requested";
  const lines = app.contract.sovLines.map((s) => {
    const l = app.lines.find((x) => x.sovLineId === s.id);
    const prev = l?.previouslyCompletedCents ?? 0;
    const thisP = l?.thisPeriodCents ?? 0;
    const stored = l?.storedCents ?? 0;
    const total = prev + thisP + stored;
    return { ...s, prev, thisP, stored, total, pct: s.scheduledValueCents ? Math.round((total / s.scheduledValueCents) * 1000) / 10 : 0, balance: s.scheduledValueCents - total };
  });

  const anyStored = lines.some((l) => l.stored > 0);
  const through = new Date(`${app.periodThrough}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const passing = checks.filter((c) => c.status === "pass");
  const attention = checks.filter((c) => c.status !== "pass");

  return (
    <div>
      <Link href={`/gc/projects/${app.contract.projectId}`} className="text-sm text-muted-foreground hover:text-link">
        {app.contract.project.name}
      </Link>
      <div className="mt-1 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[2rem] font-semibold leading-tight">Pay application #{app.number}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            From{" "}
            <Link href={`/gc/contracts/${app.contractId}`} className="hover:text-link">
              {app.contract.sub.name}
            </Link>
            , for work through {through}
          </p>
        </div>
        <StatusPill status={app.status} map={PAY_APP} />
      </div>
      {error && (
        <p role="alert" className="mt-3 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {decodeURIComponent(error)}
        </p>
      )}
      {done && app.status === "approved" && (
        <p role="status" className="mt-3 text-sm text-settled">
          Approved. It will be funded by the next owner payment.
        </p>
      )}

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section aria-labelledby="lines-heading" className="min-w-0">
          <h2 id="lines-heading" className="text-lg font-semibold">
            What was billed
          </h2>
          <div className="mt-3 overflow-hidden rounded-xl bg-card shadow-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Line</TableHead>
                  <TableHead className="text-right">Scheduled</TableHead>
                  <TableHead className="text-right">Billed Before</TableHead>
                  <TableHead className="text-right">This Period</TableHead>
                  {anyStored && <TableHead className="text-right">Stored</TableHead>}
                  <TableHead className="text-right">Left to Bill</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.map((l) => (
                  <TableRow key={l.id} className={l.thisP || l.stored ? "" : "text-muted-foreground"}>
                    <TableCell>
                      <span className="num mr-2 text-muted-foreground">{l.lineNo}</span>
                      {l.description}
                      <div className="mt-1 h-1 w-full max-w-40 overflow-hidden rounded-full bg-muted" title={`${l.pct}% billed`}>
                        <div className="h-full rounded-full bg-foreground/50" style={{ width: `${Math.min(100, l.pct)}%` }} />
                      </div>
                    </TableCell>
                    <TableCell className="num text-right">{formatCentsCompact(l.scheduledValueCents)}</TableCell>
                    <TableCell className="num text-right">{l.prev ? formatCentsCompact(l.prev) : ""}</TableCell>
                    <TableCell className="num text-right font-semibold">{l.thisP ? formatCentsCompact(l.thisP) : ""}</TableCell>
                    {anyStored && <TableCell className="num text-right">{l.stored ? formatCentsCompact(l.stored) : ""}</TableCell>}
                    <TableCell className="num text-right">{formatCentsCompact(l.balance)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <dl className="num mt-6 grid grid-cols-2 gap-x-8 gap-y-4 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-muted-foreground">Previously billed</dt>
              <dd className="font-medium">{formatCents(app.previouslyBilledCents)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Gross this period</dt>
              <dd className="font-medium">{formatCents(gross)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Retainage billed</dt>
              <dd className={`font-medium ${app.retainageApprovedCents !== null && app.retainageApprovedCents !== app.retainageBilledCents ? "line-through text-muted-foreground" : ""}`}>
                {formatCents(app.retainageBilledCents)}
              </dd>
              {app.retainageApprovedCents !== null && app.retainageApprovedCents !== app.retainageBilledCents && (
                <dd className="font-medium">{formatCents(app.retainageApprovedCents)} after correction</dd>
              )}
            </div>
            <div>
              <dt className="text-muted-foreground">Net due</dt>
              <dd className="text-lg font-semibold">{formatCents(app.netDueApprovedCents ?? app.netDueBilledCents)}</dd>
            </div>
          </dl>
        </section>

        <aside aria-labelledby="checks-heading">
          <h2 id="checks-heading" className="text-lg font-semibold">
            Checks
          </h2>
          <p className="mt-1 text-[13px] text-muted-foreground">
            {attention.length === 0 ? `All ${checks.length} passed.` : `${attention.length} of ${checks.length} need${attention.length === 1 ? "s" : ""} a look.`} Plain arithmetic against the approved rules, no model involved.
          </p>
          {attention.length > 0 && (
            <ul className="mt-3 space-y-2">
              {attention.map((c) => (
                <li key={c.id} className={`rounded-xl p-3.5 ${c.status === "fail" ? "bg-destructive/[0.06]" : "bg-hold-soft"}`}>
                  <div className="flex items-start gap-2">
                    {c.status === "fail" ? <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-hold" aria-hidden />}
                    <div className="min-w-0">
                      <div className="text-sm font-medium">{c.label}</div>
                      <div className="mt-0.5 text-[13px] text-muted-foreground">{humanize(c)}</div>
                      {c.rulePath && <div className="mt-1 text-xs text-muted-foreground">From the approved rule: {fieldLabel(c.rulePath as RuleFieldPath).toLowerCase()}</div>}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <ul className="mt-3 divide-y overflow-hidden rounded-xl bg-card shadow-card">
            {passing.map((c) => (
              <li key={c.id} className="flex items-start gap-2 px-3.5 py-2.5">
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-settled" aria-hidden />
                <div className="min-w-0">
                  <div className="text-[13px]">{c.label}</div>
                  <div className="text-xs text-muted-foreground">{humanize(c)}</div>
                </div>
              </li>
            ))}
          </ul>

          {flags.length > 0 && (
            <div className="mt-5 rounded-lg bg-link-soft p-3">
              <div className="text-xs font-medium text-muted-foreground">Claude&rsquo;s note on the checks above</div>
              <ul className="mt-2 space-y-2 text-sm">
                {flags.map((f, i) => (
                  <li key={i}>
                    <div>{f.message}</div>
                    <div className="text-xs text-muted-foreground">{f.recommendation}</div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {reviewable && (
            <form action={reviewPayAppAction} className="mt-5 space-y-3 rounded-xl bg-card p-4 shadow-card">
              <input type="hidden" name="payAppId" value={app.id} />
              <label className="block text-sm">
                <span className="text-muted-foreground">Note to {app.contract.sub.name} (optional)</span>
                <textarea name="note" rows={2} className="mt-1 w-full rounded-md border bg-background px-2 py-1.5 text-sm" />
              </label>
              <div className="flex flex-wrap gap-2">
                {onlyRetainage ? (
                  <Button type="submit" name="decision" value="correct_approve" variant="money">
                    Correct to rule and approve
                  </Button>
                ) : (
                  <Button type="submit" name="decision" value="approve" disabled={failing.length > 0} variant="money">
                    Approve
                  </Button>
                )}
                <Button type="submit" name="decision" value="request_changes" variant="outline">
                  Request changes
                </Button>
              </div>
              {onlyRetainage && (
                <p className="text-xs text-muted-foreground">
                  Sets retainage to {formatCents(failing[0].correction!.retainageCents)} ({formatBps(Math.round((failing[0].correction!.retainageCents / gross) * 10_000))} of gross, from the approved rule) and net due to {formatCents(failing[0].correction!.netDueCents)}.
                </p>
              )}
            </form>
          )}
        </aside>
      </div>
    </div>
  );
}

function humanize(c: Check): string {
  // Checks express cents; show dollars.
  return c.detail.replace(/(-?\d{3,}) cents/g, (_m, n) => formatCents(Number(n))).replace(/≠/g, "≠");
}
