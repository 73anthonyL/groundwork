import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import { requireAuth } from "@/server/auth";
import { getPayApp } from "@/server/scoped";
import { formatCents, formatBps } from "@/lib/money";
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

  return (
    <div>
      <div className="text-sm text-muted-foreground">
        <Link href={`/gc/projects/${app.contract.projectId}`} className="hover:underline">
          {app.contract.project.name}
        </Link>{" "}
        / <Link href={`/gc/contracts/${app.contractId}`} className="hover:underline">{app.contract.sub.name}</Link> / pay application #{app.number}
      </div>
      <div className="mt-1 flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-3xl font-semibold">
          Pay application #{app.number} <span className="text-muted-foreground">· through {app.periodThrough}</span>
        </h1>
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

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_400px]">
        <section aria-labelledby="lines-heading" className="min-w-0">
          <h2 id="lines-heading" className="text-lg font-semibold">
            Continuation sheet
          </h2>
          <div className="mt-3 overflow-x-auto rounded-xl bg-card shadow-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8">#</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Scheduled</TableHead>
                  <TableHead className="text-right">Previous</TableHead>
                  <TableHead className="text-right">This period</TableHead>
                  <TableHead className="text-right">Stored</TableHead>
                  <TableHead className="text-right">To date</TableHead>
                  <TableHead className="text-right">%</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.map((l) => (
                  <TableRow key={l.id} className={l.thisP || l.stored ? "" : "text-muted-foreground"}>
                    <TableCell className="num">{l.lineNo}</TableCell>
                    <TableCell>{l.description}</TableCell>
                    <TableCell className="num text-right">{formatCents(l.scheduledValueCents)}</TableCell>
                    <TableCell className="num text-right">{formatCents(l.prev)}</TableCell>
                    <TableCell className="num text-right font-medium">{formatCents(l.thisP)}</TableCell>
                    <TableCell className="num text-right">{formatCents(l.stored)}</TableCell>
                    <TableCell className="num text-right">{formatCents(l.total)}</TableCell>
                    <TableCell className="num text-right">{l.pct}%</TableCell>
                    <TableCell className="num text-right">{formatCents(l.balance)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <dl className="num mt-4 grid grid-cols-2 gap-x-6 gap-y-2 rounded-xl bg-card shadow-card p-4 text-sm sm:grid-cols-4">
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
                <dd className="font-medium text-settled">{formatCents(app.retainageApprovedCents)} corrected</dd>
              )}
            </div>
            <div>
              <dt className="text-muted-foreground">Net due</dt>
              <dd className="font-semibold">{formatCents(app.netDueApprovedCents ?? app.netDueBilledCents)}</dd>
            </div>
          </dl>
        </section>

        <aside aria-labelledby="checks-heading">
          <h2 id="checks-heading" className="text-lg font-semibold">
            Checks
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">Deterministic. Each one names the rule or figure it relied on.</p>
          <ul className="mt-3 space-y-2">
            {checks.map((c) => {
              const Icon = c.status === "pass" ? CheckCircle2 : c.status === "fail" ? XCircle : AlertTriangle;
              const tone = c.status === "pass" ? "text-settled" : c.status === "fail" ? "text-destructive" : "text-hold";
              return (
                <li key={c.id} className={`rounded-xl bg-card shadow-card p-3 ${c.status === "fail" ? "border-destructive/40" : ""}`}>
                  <div className="flex items-start gap-2">
                    <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${tone}`} aria-hidden />
                    <div className="min-w-0">
                      <div className="text-sm font-medium">{c.label}</div>
                      <div className="mt-0.5 text-xs text-muted-foreground">{humanize(c)}</div>
                      {c.rulePath && <div className="mt-1 inline-block rounded-sm bg-muted px-1.5 py-0.5 text-[11px]">Rule: {fieldLabel(c.rulePath as RuleFieldPath)}</div>}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>

          {flags.length > 0 && (
            <div className="mt-5 rounded-lg bg-link-soft p-3">
              <div className="text-xs font-medium text-muted-foreground">Proposed by Claude</div>
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
            <form action={reviewPayAppAction} className="mt-5 space-y-3 rounded-xl bg-card shadow-card p-4">
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
