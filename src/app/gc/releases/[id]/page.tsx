import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAuth } from "@/server/auth";
import { getDownstream, getRelease } from "@/server/scoped";
import { paymentLog, paymentSources } from "@/server/read/gc-money";
import { releaseLabel } from "@/lib/release-label";
import { formatCents } from "@/lib/money";
import { now } from "@/server/clock";
import { statute, type StatuteId } from "@/domain/statutes";
import { waiverMeta, type WaiverFields, type WaiverFormId } from "@/domain/waivers/ca";
import { ReleaseTimeline } from "@/components/release-timeline";
import { StatusPill, RELEASE } from "@/components/status-pill";
import { SubmitButton } from "@/components/compile-review";
import { PageBody, PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Section } from "@/components/ui/panel";
import { Table, TableBody, TableCell, TableFoot, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { retryAction, settleAction } from "./actions";

type Basis = { rulePaths: string[]; statutes: StatuteId[]; math: { label: string; cents: number }[]; notes: string[] };

const day = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
const dayTime = (d: Date) => d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const money = (cents: number) => (cents < 0 ? `−${formatCents(-cents)}` : formatCents(cents));

export default async function ReleasePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ settled?: string; retried?: string; error?: string }> }) {
  const { id } = await params;
  const { settled, retried, error } = await searchParams;
  const { org } = await requireAuth("gc");
  const r = await getRelease(org, id);
  if (!r) notFound();
  const basis = r.basis as Basis;
  const log = await paymentLog(org, id);
  const downstream = (await getDownstream(org, id)).flatMap((e) => e.releases);
  const waitingOnLowerTier = r.status === "waiver_signed" && downstream.some((x) => x.releaseCents > 0 && x.status === "awaiting_waiver");
  const nowIso = now().toISOString();
  const project = r.contract.project;
  const sub = r.contract.sub.name;
  const failed = r.status === "blocked" && r.payment?.status === "failed";
  const canSettle = r.payment?.status === "released";

  // The arithmetic, in the order it was done. The engine records it; this page only relabels it.
  const rate = basis.math.find((m) => /retainage withheld/i.test(m.label))?.label.match(/\(([^)]+)\)/)?.[1];
  const math: { label: string; cents: number }[] =
    r.kind === "retention" || !r.payApplication
      ? basis.math.map((m) => ({ label: m.label.charAt(0).toUpperCase() + m.label.slice(1), cents: m.cents })).slice(0, -1)
      : [
          { label: `Funded by this owner payment, pay app #${r.payApplication.number}`, cents: r.grossCents },
          { label: `Less retainage${rate ? ` (${rate})` : ""}`, cents: -r.retainageWithheldCents },
          ...(r.offsetCents > 0 ? [{ label: "Less backcharge", cents: -r.offsetCents }] : []),
        ];
  const clauses = await paymentSources(org, id, basis.rulePaths);
  const statutes = [...new Set(basis.statutes)];

  return (
    <>
      <PageHeader
        breadcrumbs={[
          { label: "Projects", href: "/gc/projects" },
          { label: project.name, href: `/gc/projects/${project.id}` },
          { label: "Payments", href: `/gc/projects/${project.id}/payments` },
          { label: sub },
        ]}
        title={
          <>
            <span className="num">{formatCents(r.releaseCents)}</span> to {sub}
          </>
        }
        badge={<StatusPill status={r.status} map={RELEASE} />}
        description={
          <>
            {releaseLabel(r)}, out of the owner payment received {day(r.event.receivedAt)}.{r.payByAt && r.status !== "paid" && r.status !== "settled" ? ` Due by ${day(r.payByAt)}.` : ""}
          </>
        }
        actions={
          <>
            {canSettle && (
              <form action={settleAction}>
                <input type="hidden" name="releaseId" value={r.id} />
                <SubmitButton>Confirm the bank paid it</SubmitButton>
              </form>
            )}
            {failed && (
              <form action={retryAction}>
                <input type="hidden" name="releaseId" value={r.id} />
                <SubmitButton>Send payment again</SubmitButton>
              </form>
            )}
          </>
        }
      />
      <PageBody>
        {(settled || retried || error || failed || waitingOnLowerTier) && (
          <div className="flex flex-col gap-2">
            {settled && (
              <p role="status" className="border-y px-4 py-3">
                The bank confirmed the payment. The unconditional waiver has been sent to {sub} to sign.
              </p>
            )}
            {retried && (
              <p role="status" className="border-y px-4 py-3">
                Payment sent again.
              </p>
            )}
            {error && (
              <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive-soft px-4 py-3">
                {decodeURIComponent(error)}
              </p>
            )}
            {failed && !error && (
              <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive-soft px-4 py-3">
                The bank did not accept this payment, so nothing was sent. The deadline is still running. Send the payment again.
              </p>
            )}
            {waitingOnLowerTier && (
              <p role="status" className="rounded-lg border border-hold/40 bg-hold-soft px-4 py-3">
                {sub} has signed. The subcontract also requires waivers from {sub}&rsquo;s suppliers and sub-subcontractors, so this payment is sent once they have signed.
              </p>
            )}
          </div>
        )}

        <div className="grid gap-x-10 gap-y-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,4fr)]">
          <div className="flex min-w-0 flex-col gap-8">
            <Section data-tour="payment-math" title="How the amount was worked out" description="Worked out by arithmetic from the approved payment rules. Claude is not involved.">
              <Table>
                <TableBody>
                  {math.map((m, i) => (
                    <TableRow key={i}>
                      <TableCell className={i === 0 ? undefined : "text-muted-foreground"}>{m.label}</TableCell>
                      <TableCell numeric>{money(m.cents)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFoot>
                  <TableRow>
                    <TableCell>Net payment to {sub}</TableCell>
                    <TableCell numeric>{formatCents(r.releaseCents)}</TableCell>
                  </TableRow>
                </TableFoot>
              </Table>
              {r.awaitingOwnerCents > 0 && (
                <p className="type-meta text-muted-foreground">
                  <span className="num">{formatCents(r.awaitingOwnerCents)}</span> of this pay app has not been paid by the owner yet. It is paid out of a later owner payment.
                </p>
              )}
            </Section>

            <Section data-tour="payment-sources" title="Where the numbers come from" description="Each figure, and the deadline, comes from a term of the subcontract or from state law.">
              <Table className="min-w-[440px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Source</TableHead>
                    <TableHead>What it says</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {clauses.map(
                    (c) =>
                      c.kind === "clause" && (
                        <TableRow key={c.term} className="align-top">
                          <TableCell className="align-top whitespace-nowrap">
                            <Link href={`/gc/contracts/${r.contractId}${c.page ? `?page=${c.page}` : ""}`} className="rounded-sm underline-offset-4 hover:underline">
                              Subcontract{c.page ? `, p. ${c.page}` : ""}
                            </Link>
                            {c.ruleId && <span className="type-mono ml-1.5 text-muted-foreground">{c.ruleId}</span>}
                          </TableCell>
                          <TableCell>
                            <span className="text-muted-foreground">{c.term}:</span> <span className="font-medium">{c.value}</span>
                            {c.changedBy && <span className="type-meta ml-2 text-muted-foreground">as corrected by {c.changedBy}</span>}
                            {c.quote && <blockquote className="type-contract mt-1 border-l-2 border-input pl-3">&ldquo;{c.quote}&rdquo;</blockquote>}
                          </TableCell>
                        </TableRow>
                      ),
                  )}
                  {statutes.map((s) => (
                    <TableRow key={s} className="align-top">
                      <TableCell className="type-mono align-top whitespace-nowrap">{statute(s).cite}</TableCell>
                      <TableCell className="text-muted-foreground">{statute(s).summary}</TableCell>
                    </TableRow>
                  ))}
                  {clauses.length + statutes.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={2} className="text-muted-foreground">
                        No rule or statute was recorded for this payment.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
              {basis.notes.length > 0 && (
                <ul className="type-meta flex flex-col gap-1 text-muted-foreground">
                  {basis.notes.map((n, i) => (
                    <li key={i}>{n.charAt(0).toUpperCase() + n.slice(1)}.</li>
                  ))}
                </ul>
              )}
            </Section>
          </div>

          <Section data-tour="payment-timeline" title="What happened" className="min-w-0">
            <div className="border-t pt-5">
              <ReleaseTimeline r={r} ownerName={project.owner.name} gcName={project.gc.name} nowIso={nowIso} payee={sub} log={log} />
            </div>
            <p className="type-meta text-muted-foreground">Test mode: no real money moves.</p>
          </Section>
        </div>

        <Section title="Lien waivers" description="The waivers the subcontractor signs in exchange for this payment.">
          <Table className="min-w-[640px]">
            <TableHeader>
              <TableRow>
                <TableHead>Waiver</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Signed by</TableHead>
                <TableHead>Signature record</TableHead>
                <TableHead>
                  <span className="sr-only">View</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {r.waivers.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-muted-foreground">
                    No lien waivers are required for this payment.
                  </TableCell>
                </TableRow>
              )}
              {r.waivers.map((w) => {
                const meta = waiverMeta(w.form as WaiverFormId, (w.fields as WaiverFields).state);
                return (
                  <TableRow key={w.id}>
                    <TableCell>
                      <div className="type-contract">{meta.title}</div>
                      <div className="type-caption text-muted-foreground">{meta.cite}</div>
                    </TableCell>
                    <TableCell>{w.status === "signed" ? <Badge tone="settled">Signed</Badge> : w.status === "sent" ? <Badge tone="hold">Waiting for signature</Badge> : <Badge>{w.status.charAt(0).toUpperCase() + w.status.slice(1)}</Badge>}</TableCell>
                    <TableCell>
                      {w.signerName ?? <span className="text-muted-foreground">Not yet</span>}
                      {w.signedAt && <div className="type-caption num text-muted-foreground">{dayTime(w.signedAt)}</div>}
                    </TableCell>
                    <TableCell className="type-mono text-muted-foreground" title={w.signatureHash ? `sha256 ${w.signatureHash}` : undefined}>
                      {w.signatureHash ? `sha256 ${w.signatureHash.slice(0, 12)}` : ""}
                    </TableCell>
                    <TableCell className="w-px text-right whitespace-nowrap">
                      <a href={`/api/waivers/${w.id}/pdf`} target="_blank" rel="noreferrer" className="rounded-sm text-link underline-offset-4 hover:underline">
                        View PDF
                      </a>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Section>

        {downstream.length > 0 && (
          <Section title={`Payments ${sub} makes from this one`} description={`What ${sub} pays its own suppliers and sub-subcontractors out of this payment.`}>
            <Table className="min-w-[560px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Paid to</TableHead>
                  <TableHead>Provides</TableHead>
                  <TableHead numeric>Amount</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {downstream.map((x) => (
                  <TableRow key={x.id}>
                    <TableCell className="font-medium">{x.contract.sub.name}</TableCell>
                    <TableCell muted>
                      {x.contract.lowerTierKind === "supplier" ? "Supplier" : "Sub-subcontractor"}, {x.contract.trade}
                    </TableCell>
                    <TableCell numeric>{formatCents(x.releaseCents)}</TableCell>
                    <TableCell>
                      <StatusPill status={x.status} map={RELEASE} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFoot>
                <TableRow>
                  <TableCell colSpan={2}>Total</TableCell>
                  <TableCell numeric>{formatCents(downstream.reduce((s, x) => s + x.releaseCents, 0))}</TableCell>
                  <TableCell />
                </TableRow>
              </TableFoot>
            </Table>
          </Section>
        )}
      </PageBody>
    </>
  );
}
