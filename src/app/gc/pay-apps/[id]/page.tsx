import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, CheckCircle2, ChevronRight, XCircle } from "lucide-react";
import { requireAuth } from "@/server/auth";
import { getPayAppReview, type CheckSource } from "@/server/read/gc-money";
import { formatBps, formatCents } from "@/lib/money";
import type { Check } from "@/domain/payapp/checks";
import type { PayAppFlag } from "@/lib/ai/flagPayApp";
import { PageBody, PageHeader } from "@/components/page-header";
import { SubmitButton } from "@/components/compile-review";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Field, FormActions } from "@/components/ui/field";
import { Panel, Section } from "@/components/ui/panel";
import { Table, TableBody, TableCell, TableFoot, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { StatusPill, PAY_APP, RELEASE } from "@/components/status-pill";
import { reviewPayAppAction } from "./actions";

const day = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
const isoDay = (iso: string) => day(new Date(`${iso}T00:00:00`));

const STATE = {
  fail: { label: "Failed", tone: "danger", icon: XCircle, rank: 0 },
  warn: { label: "Needs attention", tone: "hold", icon: AlertTriangle, rank: 1 },
  pass: { label: "Pass", tone: "settled", icon: CheckCircle2, rank: 2 },
} as const;

/** The checks' own labels say "application" and "contract"; the product says "pay app" and "subcontract". */
const LABEL: Partial<Record<Check["id"], string>> = {
  retainage_rate: "Retainage withheld at the subcontract's rate",
  previously_billed: "Previously billed matches the pay apps you approved",
  period_sequence: "Number and period follow the last pay app",
  net_due_math: "Net due equals the amount billed less retainage",
};

/** Checks are written in cents and ISO dates; the reader gets dollars and plain dates. */
function sentence(c: Check): string {
  return c.detail
    .replace(/(-?\d+) \+ stored (-?\d+) cents/g, (_m, a, b) => `${formatCents(Number(a))} of work and ${formatCents(Number(b))} of stored materials`)
    .replace(/states (-?\d+) \+ (-?\d+)\./g, (_m, a, b) => `states ${formatCents(Number(a))} and ${formatCents(Number(b))}.`)
    .replace(/(-?\d+) of (-?\d+) cents/g, (_m, a, b) => `${formatCents(Number(a))} of ${formatCents(Number(b))}`)
    .replace(/(-?\d+) cents/g, (_m, n) => formatCents(Number(n)))
    .replace(/Net due (-?\d+) ≠ (-?\d+) − (-?\d+)\./, (_m, a, b, c2) => `Net due is stated as ${formatCents(Number(a))}, but ${formatCents(Number(b))} less ${formatCents(Number(c2))} retainage is ${formatCents(Number(b) - Number(c2))}.`)
    .replace(/totals (-?\d+)\./, (_m, a) => `totals ${formatCents(Number(a))}.`)
    .replace(/\b(\d{4}-\d{2}-\d{2})\b/g, (_m, d) => isoDay(d))
    .replace(/application\(s\)/g, "pay app(s)")
    .replace(/\bapplication #/g, "pay app #")
    .replace(/\bApplication states\b/g, "The pay app states")
    .replace(/\bapproved rule set governs this contract\b/, "approved set of payment rules governs this subcontract")
    .replace(/Read and approve the subcontract first\./, "Read the subcontract and approve its payment rules first.");
}

function Source({ source, contractId }: { source: CheckSource; contractId: string }) {
  if (source.kind === "clause")
    return (
      <div className="flex flex-col gap-1.5">
        <div>
          <span className="text-muted-foreground">Subcontract, {source.term.toLowerCase()}</span>
          {source.ruleId && <span className="type-mono ml-1.5 text-muted-foreground">{source.ruleId}</span>}
          <span className="ml-2 font-medium">{source.value}</span>
          {source.changedBy && <span className="type-meta ml-2 text-muted-foreground">as corrected by {source.changedBy}</span>}
        </div>
        {source.quote && (
          <blockquote className="type-contract border-l-2 border-input pl-3">
            &ldquo;{source.quote}&rdquo;{" "}
            {source.page !== null && (
              <Link href={`/gc/contracts/${contractId}?page=${source.page}`} className="num rounded-sm font-sans text-xs leading-4 font-medium whitespace-nowrap text-link underline-offset-4 hover:underline" aria-label={`Open the subcontract at page ${source.page}`}>
                p. {source.page}
              </Link>
            )}
          </blockquote>
        )}
      </div>
    );
  if (source.kind === "statute")
    return (
      <div>
        <span className="type-mono">{source.cite}</span>
        <span className="ml-2 text-muted-foreground">{source.summary}</span>
      </div>
    );
  return <div className="text-muted-foreground">{source.text}</div>;
}

export default async function PayAppReviewPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; done?: string }> }) {
  const { id } = await params;
  const { error, done } = await searchParams;
  const { org } = await requireAuth("gc");
  const review = await getPayAppReview(org, id);
  if (!review) notFound();
  const { app, sources, rules, reviewedBy } = review;
  const sub = app.contract.sub.name;
  const project = app.contract.project;
  const checks = [...(app.checks as Check[])].sort((a, b) => STATE[a.status].rank - STATE[b.status].rank);
  const flags = app.flags as PayAppFlag[];
  const failing = checks.filter((c) => c.status === "fail");
  const attention = checks.filter((c) => c.status === "warn");
  const fix = failing.length === 1 && failing[0].id === "retainage_rate" ? (failing[0].correction ?? null) : null;
  const gross = app.workThisPeriodCents + app.storedMaterialsCents;
  const reviewable = app.status === "submitted" || app.status === "changes_requested";
  const lines = app.contract.sovLines.map((s) => {
    const l = app.lines.find((x) => x.sovLineId === s.id);
    const prev = l?.previouslyCompletedCents ?? 0;
    const thisP = l?.thisPeriodCents ?? 0;
    const stored = l?.storedCents ?? 0;
    return { ...s, prev, thisP, stored, balance: s.scheduledValueCents - prev - thisP - stored };
  });
  const sum = (k: "scheduledValueCents" | "prev" | "thisP" | "stored" | "balance") => lines.reduce((s, l) => s + l[k], 0);
  const anyStored = lines.some((l) => l.stored > 0);
  const corrected = app.retainageApprovedCents !== null && app.retainageApprovedCents !== app.retainageBilledCents;
  const retainage = app.retainageApprovedCents ?? app.retainageBilledCents;
  const netDue = app.netDueApprovedCents ?? app.netDueBilledCents;
  const summary =
    checks.length === 0
      ? "This pay app has not been checked."
      : failing.length + attention.length === 0
        ? `All ${checks.length} requirements pass.`
        : [failing.length ? `${failing.length} failed` : null, attention.length ? `${attention.length} need${attention.length === 1 ? "s" : ""} attention` : null].filter(Boolean).join(", ") + ` of ${checks.length}.`;

  return (
    <>
      <PageHeader
        breadcrumbs={[
          { label: "Projects", href: "/gc/projects" },
          { label: project.name, href: `/gc/projects/${project.id}` },
          { label: "Pay apps", href: `/gc/projects/${project.id}/pay-apps` },
          { label: `${sub} #${app.number}` },
        ]}
        title={`Pay app #${app.number} from ${sub}`}
        badge={<StatusPill status={app.status} map={PAY_APP} />}
        description={
          <>
            <span className="num">{formatCents(gross)}</span> billed for work through {isoDay(app.periodThrough)}
            {app.isFinal ? ", the final pay app" : ""}
            {app.submittedAt ? `. Submitted ${day(app.submittedAt)}.` : "."}{" "}
            <Link href={`/gc/contracts/${app.contractId}`} className="text-link underline-offset-4 hover:underline">
              See the subcontract&rsquo;s payment rules
            </Link>
          </>
        }
      />
      <PageBody>
        {error && (
          <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive-soft px-4 py-3">
            {decodeURIComponent(error).replace(/^cannot approve: failing checks .*/, "This pay app cannot be approved while a requirement is failing. Send it back with a note instead.")}
          </p>
        )}
        {done && !error && (app.status === "approved" || app.status === "changes_requested") && (
          <p role="status" className="border-y px-4 py-3">
            {app.status === "approved" ? `Approved. ${sub} is paid ${formatCents(netDue)} out of the next owner payment you record.` : `Sent back to ${sub} with your note.`}
          </p>
        )}

        <Section
          title="Payment requirements"
          description={`${summary} Each one is arithmetic against the approved payment rules${rules ? ` (version ${rules.version}${rules.approvedBy ? `, approved by ${rules.approvedBy}` : ""})` : ""}; no model is involved.`}
        >
          <div className="border-y">
            {checks.length === 0 && <p className="px-4 py-6 text-muted-foreground">No requirements were recorded for this pay app.</p>}
            {checks.map((c) => {
              const s = STATE[c.status];
              return (
                <details key={c.id} open={c.status !== "pass"} className="group border-b last:border-b-0">
                  <summary className="flex cursor-pointer list-none items-start gap-3 px-4 py-2.5 hover:bg-muted/60 [&::-webkit-details-marker]:hidden">
                    <s.icon aria-hidden className={`mt-0.5 size-4 shrink-0 ${c.status === "fail" ? "text-destructive" : c.status === "warn" ? "text-hold" : "text-settled"}`} />
                    <span className="min-w-0 flex-1">
                      <span className="font-medium">{LABEL[c.id] ?? c.label}</span>
                      <span className="block text-muted-foreground group-open:text-foreground">{sentence(c)}</span>
                    </span>
                    <Badge tone={s.tone} dot={false} className="mt-0.5">
                      {s.label}
                    </Badge>
                    <ChevronRight aria-hidden className="mt-1 size-4 shrink-0 text-muted-foreground group-open:rotate-90" />
                  </summary>
                  <div className="flex flex-col gap-3 pr-4 pb-4 pl-11">
                    {c.status === "fail" && c.expectedCents !== undefined && c.actualCents !== undefined && c.id !== "contract_sum" && (
                      <dl className="type-meta flex flex-wrap gap-x-8 gap-y-1">
                        <div className="flex gap-2">
                          <dt className="text-muted-foreground">Billed</dt>
                          <dd className="type-mono">{formatCents(c.actualCents)}</dd>
                        </div>
                        <div className="flex gap-2">
                          <dt className="text-muted-foreground">By the rules</dt>
                          <dd className="type-mono">{formatCents(c.expectedCents)}</dd>
                        </div>
                        <div className="flex gap-2">
                          <dt className="text-muted-foreground">Difference</dt>
                          <dd className="type-mono font-medium text-destructive">{formatCents(Math.abs(c.actualCents - c.expectedCents))}</dd>
                        </div>
                      </dl>
                    )}
                    <div className="flex flex-col gap-2">
                      <div className="type-caption font-medium text-muted-foreground">Where this comes from</div>
                      {(sources[c.id] ?? []).map((src, i) => (
                        <Source key={i} source={src} contractId={app.contractId} />
                      ))}
                    </div>
                  </div>
                </details>
              );
            })}
          </div>
          {flags.length > 0 && (
            <div className="border-y px-4 py-3">
              <div className="type-caption font-medium text-muted-foreground">Claude&rsquo;s reading of the results above. It explains; it does not decide.</div>
              <ul className="mt-2 flex flex-col gap-2">
                {flags.map((f, i) => (
                  <li key={i}>
                    <div>{f.message}</div>
                    <div className="type-meta text-muted-foreground">{f.recommendation}</div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Section>

        <Section title="Billed lines" description="Against the schedule of values in the subcontract.">
          <Table density="compact" className="min-w-[720px]">
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">#</TableHead>
                <TableHead>Line</TableHead>
                <TableHead numeric>Scheduled</TableHead>
                <TableHead numeric>Billed before</TableHead>
                <TableHead numeric>This period</TableHead>
                {anyStored && <TableHead numeric>Stored materials</TableHead>}
                <TableHead numeric>Left to bill</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.map((l) => (
                <TableRow key={l.id} className={l.thisP || l.stored ? undefined : "text-muted-foreground"}>
                  <TableCell className="type-mono text-muted-foreground">{l.lineNo}</TableCell>
                  <TableCell>{l.description}</TableCell>
                  <TableCell numeric>{formatCents(l.scheduledValueCents)}</TableCell>
                  <TableCell numeric>{formatCents(l.prev)}</TableCell>
                  <TableCell numeric className={l.thisP ? "font-medium" : undefined}>
                    {formatCents(l.thisP)}
                  </TableCell>
                  {anyStored && <TableCell numeric>{formatCents(l.stored)}</TableCell>}
                  <TableCell numeric className={l.balance < 0 ? "font-medium text-destructive" : undefined}>
                    {l.balance < 0 ? `−${formatCents(-l.balance)}` : formatCents(l.balance)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFoot>
              <TableRow>
                <TableCell colSpan={2}>Total</TableCell>
                <TableCell numeric>{formatCents(sum("scheduledValueCents"))}</TableCell>
                <TableCell numeric>{formatCents(sum("prev"))}</TableCell>
                <TableCell numeric>{formatCents(sum("thisP"))}</TableCell>
                {anyStored && <TableCell numeric>{formatCents(sum("stored"))}</TableCell>}
                <TableCell numeric>{formatCents(sum("balance"))}</TableCell>
              </TableRow>
            </TableFoot>
          </Table>
        </Section>

        <div className="grid gap-8 lg:grid-cols-2">
          <Section title="Amount due">
            <Table>
              <TableBody>
                <TableRow>
                  <TableCell>Billed this period</TableCell>
                  <TableCell numeric>{formatCents(gross)}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="text-muted-foreground">
                    Less retainage{gross > 0 ? ` (${formatBps(Math.round((retainage / gross) * 10_000))})` : ""}
                    {corrected && <span className="type-meta block">Billed as {formatCents(app.retainageBilledCents)}; corrected to the subcontract&rsquo;s rate.</span>}
                    {!corrected && fix && <span className="type-meta block text-destructive">The rules require {formatCents(fix.retainageCents)}.</span>}
                  </TableCell>
                  <TableCell numeric className="align-top">
                    −{formatCents(retainage)}
                  </TableCell>
                </TableRow>
              </TableBody>
              <TableFoot>
                <TableRow>
                  <TableCell>
                    Net due {app.netDueApprovedCents !== null ? "as approved" : "as billed"}
                    {!corrected && fix && <span className="type-meta block font-normal text-muted-foreground">By the rules it is {formatCents(fix.netDueCents)}.</span>}
                  </TableCell>
                  <TableCell numeric className="align-top">
                    {formatCents(netDue)}
                  </TableCell>
                </TableRow>
              </TableFoot>
            </Table>
            <p className="type-meta text-muted-foreground">
              Previously billed on this subcontract: <span className="num">{formatCents(app.previouslyBilledCents)}</span>.
            </p>
          </Section>

          {reviewable ? (
            <Panel title="Your decision" description={app.status === "changes_requested" ? `You sent this back to ${sub}. You can still decide on it as it stands.` : undefined}>
              <form action={reviewPayAppAction} className="flex flex-col gap-4">
                <input type="hidden" name="payAppId" value={app.id} />
                {fix ? (
                  <p>
                    One requirement failed and Groundwork can correct it: retainage becomes <span className="num font-medium">{formatCents(fix.retainageCents)}</span> and net due <span className="num font-medium">{formatCents(fix.netDueCents)}</span>, as the subcontract requires. {sub} sees the correction and your note.
                  </p>
                ) : failing.length > 0 ? (
                  <p>
                    {failing.length} requirement{failing.length === 1 ? "" : "s"} failed, and the figures cannot be corrected from the rules alone. Send it back so {sub} can fix and resubmit it.
                  </p>
                ) : (
                  <p>
                    Every requirement passes. Approving sets <span className="num font-medium">{formatCents(app.netDueBilledCents)}</span> to be paid out of the next owner payment you record.
                  </p>
                )}
                <Field label={`Note to ${sub}`} optional help="Sent with your decision. Say what to change if you are sending it back.">
                  <Textarea name="note" />
                </Field>
                <FormActions>
                  {failing.length > 0 && !fix ? (
                    <SubmitButton name="decision" value="request_changes">
                      Send back with a note
                    </SubmitButton>
                  ) : (
                    <>
                      <SubmitButton name="decision" value="request_changes" variant="secondary">
                        Send back with a note
                      </SubmitButton>
                      {fix ? (
                        <SubmitButton name="decision" value="correct_approve">
                          Approve with the corrected amount
                        </SubmitButton>
                      ) : (
                        <SubmitButton name="decision" value="approve">
                          Approve
                        </SubmitButton>
                      )}
                    </>
                  )}
                </FormActions>
              </form>
            </Panel>
          ) : (
            <Section title="Decision">
              <div className="border-t pt-5">
                <p>
                  {app.status === "draft" ? "Not submitted yet." : `Approved${reviewedBy ? ` by ${reviewedBy}` : ""}${app.reviewedAt ? ` on ${day(app.reviewedAt)}` : ""}${corrected ? ", with retainage corrected to the subcontract's rate" : ""}.`}
                </p>
                {app.reviewNote && <p className="type-meta mt-1 text-muted-foreground">Note: {app.reviewNote}</p>}
                {app.releases.length > 0 ? (
                  <ul className="mt-3 flex flex-col gap-2 border-t pt-3">
                    {app.releases.map((r) => (
                      <li key={r.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                        <Link href={`/gc/releases/${r.id}`} className="rounded-sm font-medium underline-offset-4 hover:underline">
                          <span className="num">{formatCents(r.releaseCents)}</span> from the owner payment of {day(r.event.receivedAt)}
                        </Link>
                        <StatusPill status={r.status} map={RELEASE} />
                      </li>
                    ))}
                  </ul>
                ) : (
                  app.status === "approved" && (
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t pt-3">
                      <span className="text-muted-foreground">Waiting for the next owner payment to fund it.</span>
                      <Link href={`/gc/projects/${project.id}?record=1`} className={buttonVariants({ variant: "secondary", size: "sm" })}>
                        Record owner payment
                      </Link>
                    </div>
                  )
                )}
              </div>
            </Section>
          )}
        </div>
      </PageBody>
    </>
  );
}
