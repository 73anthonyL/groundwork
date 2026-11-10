import type { Organization } from "@/db/schema";
import { projectOverview } from "@/server/read/project";
import { MoneyFlow } from "@/components/viz/money-flow";
import { ClockBoard } from "@/components/viz/clock-ring";
import { BalanceChart, ContractBars, EventTimeline } from "@/components/viz/charts";
import { RollingNumber } from "@/components/viz/rolling-number";

export function Panel({ id, title, hint, children, className = "" }: { id: string; title: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <section aria-labelledby={id} className={`rounded-lg border bg-card p-5 shadow-card ${className}`}>
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
    { label: "Paid to subcontractors", cents: t.paidCents, tone: "text-settled" },
    { label: "On its way", cents: t.inMotionCents, tone: "text-money" },
    { label: "Retainage held", cents: t.retainageHeldCents, tone: "text-hold" },
    { label: "Billed, waiting on the owner", cents: t.awaitingOwnerCents, tone: "" },
  ];
  return (
    <div className="space-y-6">
      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border shadow-card lg:grid-cols-4">
        {figures.map((f) => (
          <div key={f.label} className="bg-card p-4">
            <dd className={`type-numeral text-3xl sm:text-4xl ${f.tone}`}>
              <RollingNumber value={f.cents} />
            </dd>
            <dt className="mt-2 text-xs text-muted-foreground">{f.label}</dt>
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
