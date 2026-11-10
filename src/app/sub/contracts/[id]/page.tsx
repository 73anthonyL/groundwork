import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAuth } from "@/server/auth";
import { getContract, getContractAdjustments, listReleasesForContract } from "@/server/scoped";
import { ContractAdjustments } from "@/components/contract-adjustments";
import { formatCentsCompact } from "@/lib/money";
import { now } from "@/server/clock";
import { ReleaseTimeline } from "@/components/release-timeline";
import { StatusPill, PAY_APP } from "@/components/status-pill";
import { latestExplanation } from "@/server/actions/explain";
import { Button } from "@/components/ui/button";
import { addLowerTierAction, explainAction, requestChangeOrderAction } from "./actions";

export default async function SubContractPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ signed?: string; msg?: string }> }) {
  const { id } = await params;
  const { signed, msg } = await searchParams;
  const { org } = await requireAuth("sub");
  const contract = await getContract(org, id);
  if (!contract) notFound();
  const releases = await listReleasesForContract(org, id);
  const adjustments = contract.status === "active" ? await getContractAdjustments(org, id) : null;
  const explanations = Object.fromEntries(await Promise.all(releases.map(async (r) => [r.id, await latestExplanation(r.id)] as const)));
  const nowIso = now().toISOString();

  return (
    <div>
      <Link href="/sub" className="text-sm text-muted-foreground hover:underline">
        ← Where&rsquo;s my money
      </Link>
      <div className="mt-2 text-xs text-muted-foreground">{contract.project.name}</div>
      <h1 className="text-2xl font-semibold">{contract.trade}</h1>
      <div className="num mt-1 text-sm text-muted-foreground">
        {formatCentsCompact(contract.contractSumCents)} subcontract with {contract.project.gc.name}
      </div>
      {signed && (
        <p role="status" className="mt-4 rounded-md border border-settled/40 bg-settled-soft px-3 py-2 text-sm text-settled">
          Signed. Your release is on its way.
        </p>
      )}

      {msg && (
        <p role="status" className="mt-4 rounded-md border bg-card px-3 py-2 text-sm">
          {decodeURIComponent(msg)}
        </p>
      )}

      <section className="mt-6 space-y-4" aria-labelledby="timeline-heading">
        <h2 id="timeline-heading" className="text-lg font-semibold">
          Payments
        </h2>
        {releases.length === 0 && <p className="text-sm text-muted-foreground">No owner payments have been allocated to this contract yet.</p>}
        {releases.map((r) => {
          const ex = explanations[r.id];
          const stale = ex && ex.status !== r.status;
          return (
            <article key={r.id} id={`release-${r.id}`} className="rounded-md border bg-card p-4">
              <ReleaseTimeline r={r} ownerName={contract.project.owner.name} gcName={contract.project.gc.name} nowIso={nowIso} signHref={(wid) => `/sub/waivers/${wid}/sign`} />
              <div className="mt-4 border-t pt-3">
                {ex && !stale ? (
                  <div className="text-sm">
                    <div className="text-xs font-medium text-money">{ex.model === "deterministic" ? "Explained from the ledger" : "Explained by Claude from the ledger"}</div>
                    <p className="mt-1">{ex.explanation}</p>
                    <p className="mt-1 text-muted-foreground">{ex.nextStep}</p>
                  </div>
                ) : (
                  <form action={explainAction}>
                    <input type="hidden" name="releaseId" value={r.id} />
                    <Button type="submit" variant="outline" size="sm">
                      Explain this payment
                    </Button>
                  </form>
                )}
                <div className="mt-2 flex gap-3 text-xs">
                  {r.waivers.filter((w) => w.status === "signed").map((w) => (
                    <a key={w.id} href={`/api/waivers/${w.id}/pdf`} target="_blank" rel="noreferrer" className="underline underline-offset-2">
                      Signed {w.form.startsWith("c") ? "conditional" : "unconditional"} release (PDF)
                    </a>
                  ))}
                </div>
              </div>
            </article>
          );
        })}
      </section>

      {adjustments && (
        <div className="mt-8">
          <ContractAdjustments data={adjustments} role="payee" actions={{ proposeChangeOrder: requestChangeOrderAction, addLowerTier: addLowerTierAction }} />
        </div>
      )}

      <section className="mt-8" aria-labelledby="payapps-heading">
        <div className="flex items-baseline justify-between">
          <h2 id="payapps-heading" className="text-lg font-semibold">
            Pay applications
          </h2>
          <Link href={`/sub/pay-apps/new?contract=${contract.id}`} className="text-sm underline underline-offset-2">
            Submit pay app
          </Link>
        </div>
        <ul className="mt-3 divide-y rounded-md border bg-card">
          {contract.payApplications.map((p) => (
            <li key={p.id} className="flex items-center justify-between px-4 py-3 text-sm">
              <div>
                <div className="font-medium">#{p.number} · through {p.periodThrough}</div>
                <div className="num text-muted-foreground">
                  {formatCentsCompact(p.workThisPeriodCents + p.storedMaterialsCents)} billed · {formatCentsCompact(p.netDueApprovedCents ?? p.netDueBilledCents)} net
                </div>
              </div>
              <StatusPill status={p.status} map={PAY_APP} />
            </li>
          ))}
          {contract.payApplications.length === 0 && <li className="px-4 py-3 text-sm text-muted-foreground">None yet.</li>}
        </ul>
      </section>
    </div>
  );
}
