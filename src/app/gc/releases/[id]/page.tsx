import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAuth } from "@/server/auth";
import { getDownstream, getRelease } from "@/server/scoped";
import { releaseLabel } from "@/lib/release-label";
import { formatCents } from "@/lib/money";
import { now } from "@/server/clock";
import { statute, type StatuteId } from "@/domain/statutes";
import { fieldLabel } from "@/server/rules/review";
import type { RuleFieldPath } from "@/domain/rules/schema";
import { waiverMeta, type WaiverFields, type WaiverFormId } from "@/domain/waivers/ca";
import { ReleaseTimeline } from "@/components/release-timeline";
import { StatusPill, RELEASE } from "@/components/status-pill";
import { Button } from "@/components/ui/button";
import { retryAction, settleAction } from "./actions";

type Basis = { rulePaths: string[]; statutes: StatuteId[]; math: { label: string; cents: number }[]; notes: string[] };

export default async function ReleasePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ settled?: string; retried?: string; error?: string }> }) {
  const { id } = await params;
  const { settled, retried, error } = await searchParams;
  const { org } = await requireAuth("gc");
  const r = await getRelease(org, id);
  if (!r) notFound();
  const basis = r.basis as Basis;
  const downstream = (await getDownstream(org, id)).flatMap((e) => e.releases.map((x) => ({ ...x, pool: e.amountCents })));
  const waitingOnLowerTier = r.status === "waiver_signed" && downstream.some((x) => x.releaseCents > 0 && x.status === "awaiting_waiver");
  const nowIso = now().toISOString();
  const project = r.contract.project;

  return (
    <div>
      <div className="text-sm text-muted-foreground">
        <Link href={`/gc/projects/${project.id}`} className="hover:underline">
          {project.name}
        </Link>{" "}
        / <Link href={`/gc/contracts/${r.contractId}`} className="hover:underline">{r.contract.sub.name}</Link> / {releaseLabel(r, { lower: true })}
      </div>
      <div className="mt-1 flex flex-wrap items-end justify-between gap-4">
        <h1 className="num text-3xl font-semibold">{formatCents(r.releaseCents)}</h1>
        <StatusPill status={r.status} map={RELEASE} />
      </div>
      {settled && (
        <p role="status" className="mt-3 text-sm text-settled">
          Settled at the bank. The unconditional release has been sent to {r.contract.sub.name}.
        </p>
      )}

      {retried && (
        <p role="status" className="mt-3 text-sm text-settled">
          Payment sent again.
        </p>
      )}
      {error && (
        <p role="alert" className="mt-3 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {decodeURIComponent(error)}
        </p>
      )}
      {r.status === "blocked" && r.payment?.status === "failed" && (
        <form action={retryAction} className="mt-4 flex flex-wrap items-center gap-3 rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm">
          <input type="hidden" name="releaseId" value={r.id} />
          <span>The bank did not accept this payment. Nothing was sent.</span>
          <Button type="submit" size="sm" variant="outline">
            Send it again
          </Button>
        </form>
      )}

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl bg-card shadow-card p-5" aria-labelledby="basis-heading">
          <h2 id="basis-heading" className="text-lg font-semibold">
            Why these numbers
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">Computed by the deterministic engine from the approved rules. No model touched the arithmetic.</p>
          <dl className="num mt-4 divide-y text-sm">
            {basis.math.map((m, i) => (
              <div key={i} className="flex items-center justify-between py-2">
                <dt className="text-muted-foreground">{m.label}</dt>
                <dd className={`font-medium ${m.cents < 0 ? "text-hold" : ""}`}>{m.cents < 0 ? `−${formatCents(-m.cents)}` : formatCents(m.cents)}</dd>
              </div>
            ))}
          </dl>
          <h3 className="mt-5 text-sm font-semibold">Rules applied</h3>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {[...new Set(basis.rulePaths)].map((p) => (
              <li key={p} className="rounded-sm bg-muted px-2 py-0.5 text-xs">
                {fieldLabel(p as RuleFieldPath)}
              </li>
            ))}
          </ul>
          {basis.statutes.length > 0 && (
            <>
              <h3 className="mt-5 text-sm font-semibold">Statutes applied</h3>
              <ul className="mt-2 space-y-2 text-sm">
                {[...new Set(basis.statutes)].map((s) => (
                  <li key={s}>
                    <span className="font-medium">{statute(s).cite}</span> · {statute(s).title}. <span className="text-muted-foreground">{statute(s).summary}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
          {basis.notes.length > 0 && (
            <ul className="mt-4 list-disc pl-5 text-xs text-muted-foreground">
              {basis.notes.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-xl bg-card shadow-card p-5" aria-labelledby="timeline-heading">
          <h2 id="timeline-heading" className="text-lg font-semibold">
            Where it is
          </h2>
          <div className="mt-4">
            <ReleaseTimeline r={r} ownerName={project.owner.name} gcName={project.gc.name} nowIso={nowIso} />
          </div>
          {r.payment && r.payment.status === "released" && (
            <form action={settleAction} className="mt-5">
              <input type="hidden" name="releaseId" value={r.id} />
              <Button type="submit" variant="outline">
                Settle at bank (simulated rail)
              </Button>
              <p className="mt-1 text-xs text-muted-foreground">Posts a bill.paid webhook through the same route a real rail would use.</p>
            </form>
          )}
          {waitingOnLowerTier && (
            <p role="status" className="mt-5 rounded-md border border-hold/40 bg-hold-soft px-3 py-2 text-sm text-hold">
              Signed by {r.contract.sub.name}. The subcontract requires lower-tier waivers, so payment goes out when the parties below have signed.
            </p>
          )}
          {downstream.length > 0 && (
            <>
              <h3 className="mt-6 text-sm font-semibold">Flows down to</h3>
              <ul className="mt-2 space-y-2 text-sm">
                {downstream.map((x) => (
                  <li key={x.id} className="flex items-center justify-between gap-3 rounded-sm border px-3 py-2">
                    <div className="min-w-0">
                      <div className="font-medium">{x.contract.sub.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {x.contract.lowerTierKind === "supplier" ? "Supplier" : "Sub-subcontractor"} · {x.contract.trade}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <span className="num font-medium">{formatCents(x.releaseCents)}</span>
                      <StatusPill status={x.status} map={RELEASE} />
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
          <h3 className="mt-6 text-sm font-semibold">Waivers</h3>
          <ul className="mt-2 space-y-2 text-sm">
            {r.waivers.map((w) => (
              <li key={w.id} className="rounded-sm border px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span>{waiverMeta(w.form as WaiverFormId, (w.fields as WaiverFields).state).title}</span>
                  <span className="text-xs text-muted-foreground">{w.status}</span>
                </div>
                {w.signatureHash && (
                  <div className="mt-1 break-all font-mono text-[11px] text-muted-foreground">
                    {w.signerName} · sha256 {w.signatureHash.slice(0, 24)}…
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
