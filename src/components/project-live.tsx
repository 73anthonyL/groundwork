import type { Organization } from "@/db/schema";
import { projectOverview } from "@/server/read/project";
import { MoneyFlow } from "@/components/viz/money-flow";
import { ClockBoard } from "@/components/viz/clock-ring";
import { BalanceChart, ContractBars, EventTimeline } from "@/components/viz/charts";
import { RollingNumber } from "@/components/viz/rolling-number";

export function Panel({ id, title, hint, children, className = "" }: { id: string; title: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <section aria-labelledby={id} className={`rounded-xl bg-card p-6 shadow-card ${className}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id={id} className="text-base font-semibold">
          {title}
        </h2>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

/**
 * The project as pictures, from the read model. Works for any organization that can see the project:
 * the contractor and owner see the whole chain, a subcontractor sees its own slice.
 */
export async function ProjectLive({ org, projectId, autoPlay = false }: { org: Organization; projectId: string; autoPlay?: boolean }) {
  const o = await projectOverview(org, projectId);
  if (!o) return null;
  const { summary, flow, timeline, series, clocks } = o;
  const t = summary.totals;
  const figures = [
    { label: "Paid to subcontractors", cents: t.paidCents, color: "var(--flow-paid)" },
    { label: "On its way", cents: t.inMotionCents, color: "var(--flow-moving)" },
    { label: "Retainage held", cents: t.retainageHeldCents, color: "var(--flow-held)" },
    { label: "Billed, waiting on the owner", cents: t.awaitingOwnerCents, color: "var(--flow-idle)" },
  ];
  return (
    <div className="space-y-6">
      <dl className="grid grid-cols-2 gap-x-10 gap-y-6 border-b pb-8 lg:grid-cols-4">
        {figures.map((f) => (
          <div key={f.label}>
            <dt className="flex items-center gap-2 text-sm text-muted-foreground">
              <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: f.color }} />
              {f.label}
            </dt>
            <dd className="type-numeral mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
              <RollingNumber value={f.cents} />
            </dd>
          </div>
        ))}
      </dl>

      <Panel id="flow-heading" title="Where the money went" hint="Ribbon width is dollars. Step through each owner payment.">
        <MoneyFlow flow={flow} autoPlay={autoPlay} />
      </Panel>

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel id="clocks-heading" title="On the clock" hint={`${t.openReleases} in motion${t.overdueReleases ? ` · ${t.overdueReleases} late` : ""}`}>
          <ClockBoard clocks={clocks} nowIso={summary.asOf} empty="Every release has been paid. Nothing is on a clock." />
        </Panel>
        <Panel id="contracts-heading" title="Each contract" hint="Share of the contract sum">
          <ContractBars contracts={summary.contracts} />
        </Panel>
      </div>

      <Panel id="balance-heading" title="Where every dollar sits" hint="After each ledger posting">
        <BalanceChart series={series} />
      </Panel>

      <Panel id="timeline-heading" title="Everything that happened" hint={`${timeline.length} events, from the append-only log`}>
        <EventTimeline entries={timeline} />
      </Panel>
    </div>
  );
}
