import type { Organization } from "@/db/schema";
import { projectOverview } from "@/server/read/project";
import { Panel as UiPanel } from "@/components/ui/panel";
import { Stat, StatGroup } from "@/components/ui/stat";
import { MoneyFlow } from "@/components/viz/money-flow";
import { ClockBoard } from "@/components/viz/clock-ring";
import { BalanceChart, ContractBars, EventTimeline } from "@/components/viz/charts";
import { RollingNumber } from "@/components/viz/rolling-number";

/** A titled chart panel. `hint` is one short line under the title. */
export function Panel({ id, title, hint, children, className = "" }: { id: string; title: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <UiPanel aria-labelledby={id} title={<span id={id}>{title}</span>} description={hint} className={className}>
      {children}
    </UiPanel>
  );
}

/**
 * The project as charts, from the read model. Works for any organization that can see the project:
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
    <div className="flex flex-col gap-6">
      <StatGroup className="sm:grid sm:grid-cols-4">
        {figures.map((f) => (
          <Stat
            key={f.label}
            label={
              <span className="flex items-center gap-1.5">
                <span aria-hidden className="size-2 shrink-0 rounded-[2px]" style={{ background: f.color }} />
                {f.label}
              </span>
            }
            value={<RollingNumber value={f.cents} />}
          />
        ))}
      </StatGroup>

      <Panel id="flow-heading" title="Money flow" hint="Owner on the left, subcontractors on the right. Width is dollars.">
        <MoneyFlow flow={flow} autoPlay={autoPlay} height={340} />
      </Panel>

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel id="clocks-heading" title="Deadlines running" hint={`${t.openReleases} payment${t.openReleases === 1 ? "" : "s"} on the way${t.overdueReleases ? `, ${t.overdueReleases} late` : ""}`}>
          <ClockBoard clocks={clocks} nowIso={summary.asOf} empty="Every payment has been paid. No deadline is running." />
        </Panel>
        <Panel id="contracts-heading" title="Each subcontract" hint="Share of the subcontract sum">
          <ContractBars contracts={summary.contracts} />
        </Panel>
      </div>

      <Panel id="balance-heading" title="Where every dollar sits" hint="After each owner payment and each payment out">
        <BalanceChart series={series} />
      </Panel>

      <Panel id="timeline-heading" title="Activity" hint={`${timeline.length} recorded events, oldest first`}>
        <EventTimeline entries={timeline} />
      </Panel>
    </div>
  );
}
