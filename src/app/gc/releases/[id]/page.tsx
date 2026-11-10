import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAuth } from "@/server/auth";
import { getRelease } from "@/server/scoped";
import { formatCents } from "@/lib/money";
import { now } from "@/server/clock";
import { STATUTES, type StatuteId } from "@/domain/statutes";
import { fieldLabel } from "@/server/rules/review";
import type { RuleFieldPath } from "@/domain/rules/schema";
import { WAIVER_TITLES, type WaiverFormId } from "@/domain/waivers/ca";
import { ReleaseTimeline } from "@/components/release-timeline";
import { StatusPill, RELEASE } from "@/components/status-pill";
import { Button } from "@/components/ui/button";
import { settleAction } from "./actions";

type Basis = { rulePaths: string[]; statutes: StatuteId[]; math: { label: string; cents: number }[]; notes: string[] };

export default async function ReleasePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ settled?: string }> }) {
  const { id } = await params;
  const { settled } = await searchParams;
  const { org } = await requireAuth("gc");
  const r = await getRelease(org, id);
  if (!r) notFound();
  const basis = r.basis as Basis;
  const nowIso = now().toISOString();
  const project = r.contract.project;

  return (
    <div>
      <div className="text-sm text-muted-foreground">
        <Link href={`/gc/projects/${project.id}`} className="hover:underline">
          {project.name}
        </Link>{" "}
        / <Link href={`/gc/contracts/${r.contractId}`} className="hover:underline">{r.contract.sub.name}</Link> / release
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

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section className="rounded-md border bg-card p-5" aria-labelledby="basis-heading">
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
                    <span className="font-medium">{STATUTES[s].cite}</span> — {STATUTES[s].title}.{" "}
                    <span className="text-muted-foreground">{STATUTES[s].summary}</span>
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

        <section className="rounded-md border bg-card p-5" aria-labelledby="timeline-heading">
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
          <h3 className="mt-6 text-sm font-semibold">Waivers</h3>
          <ul className="mt-2 space-y-2 text-sm">
            {r.waivers.map((w) => (
              <li key={w.id} className="rounded-sm border px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span>{WAIVER_TITLES[w.form as WaiverFormId].title}</span>
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
