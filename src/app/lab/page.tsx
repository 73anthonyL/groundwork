import Link from "next/link";
import { requireAuth } from "@/server/auth";
import { listProjects } from "@/server/scoped";
import { projectOverview } from "@/server/read/project";
import { latestEval } from "@/server/read/eval";
import { STATES } from "@/domain/statutes";
import { AppShell } from "@/components/app-shell";
import { PageBody, PageHeader } from "@/components/page-header";
import { ThemeSwitcher } from "@/components/viz/theme-switcher";
import { MoneyFlow } from "@/components/viz/money-flow";
import { ClockBoard } from "@/components/viz/clock-ring";
import { AblationChart, BalanceChart, ContractBars, DaysGap, EvalHeadline, EventTimeline } from "@/components/viz/charts";
import { StateGrid } from "@/components/viz/state-grid";
import { RollingNumber } from "@/components/viz/rolling-number";
import { StatusPill, RELEASE, PAY_APP } from "@/components/status-pill";
import { Button } from "@/components/ui/button";
import { SAMPLE_FLOW } from "@/lib/sample-flow";

export const metadata = { title: "Lab" };

function Specimen({ id, name, file, data, children, note }: { id: string; name: string; file: string; data: string; note?: string; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="scroll-mt-6 rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b pb-3">
        <h2 id={`${id}-h`} className="type-section">
          {name}
        </h2>
        <div className="type-mono type-caption text-muted-foreground">
          {file}, data: {data}
        </div>
      </div>
      {note && <p className="type-meta mt-3 max-w-3xl text-muted-foreground">{note}</p>}
      <div className="mt-5">{children}</div>
    </section>
  );
}

/**
 * Every visual in one place, on live data, with theme and type switching. This is the page to sit on
 * when deciding how Groundwork should look: change a token in globals.css or a spring in
 * src/lib/motion.ts and every specimen here moves together.
 */
export default async function LabPage() {
  const session = await requireAuth();
  const [project] = await listProjects(session.org);
  const o = project ? await projectOverview(session.org, project.id) : null;
  const run = latestEval();
  const index = [
    ["flow", "Money flow"], ["flow-story", "Money flow, autoplay"], ["clocks", "Clock rings"], ["bars", "Contract bars"], ["balance", "Balance chart"], ["timeline", "Event timeline"], ["states", "State map"], ["eval", "Eval"], ["gap", "Days gap"], ["type", "Type and color"],
  ];
  return (
    <AppShell session={session}>
      <PageHeader title="Lab" description={`Reference page: every chart and token in one place, on ${project ? project.name : "sample"} data.`} actions={<ThemeSwitcher />}>
        <nav aria-label="Specimens" className="type-meta flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground">
          {index.map(([id, label]) => (
            <a key={id} href={`#${id}`} className="rounded-sm underline-offset-4 hover:text-foreground hover:underline">
              {label}
            </a>
          ))}
        </nav>
      </PageHeader>
      <PageBody className="gap-6">
        <Specimen id="flow" name="Money flow" file="components/viz/money-flow.tsx" data="/api/v1/projects/:id/flow" note="Owner to contractor to subcontractors to their lower tier. Ribbon width is dollars; orange ribbons carry particles until the payment lands. Hover a party to isolate it; the dots step through owner payments.">
          {o ? <MoneyFlow flow={o.flow} /> : <MoneyFlow flow={SAMPLE_FLOW} />}
        </Specimen>

        <Specimen id="flow-story" name="Money flow, autoplay" file="components/viz/money-flow.tsx" data="lib/sample-flow.ts" note="The same component on fixed sample data, playing from the first payment. This is what the landing page shows.">
          <MoneyFlow flow={SAMPLE_FLOW} autoPlay height={360} />
        </Specimen>

        <Specimen id="clocks" name="Clock rings" file="components/viz/clock-ring.tsx" data="/api/v1/projects/:id/clocks" note="One ring per release in motion. It empties toward the deadline and names the statute that set it. Green with more than half the period left, amber under half, orange under a quarter, red when late.">
          {o ? <ClockBoard clocks={o.clocks} nowIso={o.summary.asOf} /> : <p className="text-sm text-muted-foreground">Reset the sample workspace to see clocks.</p>}
        </Specimen>

        <Specimen id="bars" name="Contract bars" file="components/viz/charts.tsx, ContractBars" data="/api/v1/projects/:id/summary" note="Each contract sum split into paid, on its way, held, backcharged and billed-but-unfunded. Lower-tier parties hang under the contract that pays them.">
          {o && <ContractBars contracts={o.summary.contracts} />}
        </Specimen>

        <Specimen id="balance" name="Balance chart" file="components/viz/charts.tsx, BalanceChart" data="/api/v1/projects/:id/series" note="Payments as a stacked step chart: after each posting, where the owner's money sits. Hover to read a moment.">
          {o && <BalanceChart series={o.series} />}
        </Specimen>

        <Specimen id="timeline" name="Event timeline" file="components/viz/charts.tsx, EventTimeline" data="/api/v1/projects/:id/timeline" note="The append-only event log on five lanes. Larger dots are owner payments and settlements. Hover a dot to read it.">
          {o && <EventTimeline entries={o.timeline} />}
        </Specimen>

        <Specimen id="states" name="State map" file="components/viz/state-grid.tsx" data="/api/v1/statutes" note="Pick a rule and every state takes its color. Faded tiles rest on a low-confidence source. The full page is at /statutes.">
          <StateGrid states={STATES} />
        </Specimen>

        <Specimen id="eval" name="Eval" file="components/viz/charts.tsx, EvalHeadline, AblationChart" data="/api/v1/eval" note="The extraction eval: headline figures, then how many wrong values would reach the engine unflagged under each review policy.">
          {run ? (
            <div className="space-y-6">
              <EvalHeadline run={run} />
              <AblationChart run={run} />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No eval results on disk. Run pnpm eval.</p>
          )}
        </Specimen>

        <Specimen id="gap" name="Days gap" file="components/viz/charts.tsx, DaysGap" data="fixed (Built, Aug 2026)" note="The problem in one picture. Shown here on the page background and on the dark stage used by the landing hero.">
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-md border p-5">
              <DaysGap />
            </div>
            <div className="rounded-md bg-stage p-5 text-stage-foreground">
              <DaysGap onStage />
            </div>
          </div>
        </Specimen>

        <Specimen id="type" name="Type and color" file="app/globals.css" data="tokens" note="The parts everything else is built from. Switch theme and type above and watch these change.">
          <div className="grid gap-8 lg:grid-cols-2">
            <div className="space-y-4">
              <div>
                <div className="type-label text-muted-foreground">Page title</div>
                <div className="type-title">Bayview Clinic TI</div>
              </div>
              <div>
                <div className="type-label text-muted-foreground">Figure</div>
                <div className="type-figure num">
                  <RollingNumber value={32_500_000} />
                </div>
              </div>
              <div>
                <div className="type-label text-muted-foreground">Section heading</div>
                <div className="type-section">Where the money went</div>
              </div>
              <div>
                <div className="type-label text-muted-foreground">Body and data</div>
                <p className="text-sm">The contract already says when the sub gets paid.</p>
                <p className="type-mono text-sm">$45,000.00, sha256 9f2c41ab…, 7d 3h left</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button>Record owner payment</Button>
                <Button variant="secondary">Request changes</Button>
                <Button variant="tertiary">Cancel</Button>
                <Button variant="destructive">Remove</Button>
              </div>
              <div className="flex flex-wrap gap-2">
                {["awaiting_waiver", "waiver_signed", "payment_initiated", "paid", "settled", "blocked"].map((s) => (
                  <StatusPill key={s} status={s} map={RELEASE} />
                ))}
                {["submitted", "approved", "funded"].map((s) => (
                  <StatusPill key={s} status={s} map={PAY_APP} />
                ))}
              </div>
            </div>
            <ul className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
              {[
                ["background", "bg-background"], ["card", "bg-card"], ["muted", "bg-muted"], ["foreground", "bg-foreground"], ["money", "bg-money"], ["money soft", "bg-money-soft"], ["settled", "bg-settled"], ["settled soft", "bg-settled-soft"], ["hold", "bg-hold"], ["hold soft", "bg-hold-soft"], ["flow setoff", "bg-flow-setoff"], ["flow idle", "bg-flow-idle"], ["stage", "bg-stage"], ["destructive", "bg-destructive"], ["border", "bg-border"],
              ].map(([name, cls]) => (
                <li key={name} className="overflow-hidden rounded-md border">
                  <div className={`h-12 ${cls}`} />
                  <div className="bg-card px-2 py-1.5 type-mono type-caption text-muted-foreground">{name}</div>
                </li>
              ))}
            </ul>
          </div>
        </Specimen>
      <p className="type-caption text-muted-foreground">
        Tokens live in <span className="font-mono">src/app/globals.css</span>, motion in <span className="font-mono">src/lib/motion.ts</span>, and every chart reads the JSON listed at{" "}
        <Link href="/api/v1" className="underline underline-offset-2">
          /api/v1
        </Link>
        .
      </p>
      </PageBody>
    </AppShell>
  );
}
