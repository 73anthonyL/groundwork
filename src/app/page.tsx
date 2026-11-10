import Link from "next/link";
import { ArrowRight, FileText, ScanSearch, Scale, Waypoints } from "lucide-react";
import { auth, homeFor } from "@/server/auth";
import { latestEval } from "@/server/read/eval";
import { STATES, coverage } from "@/domain/statutes";
import { Wordmark } from "@/components/wordmark";
import { MoneyFlow } from "@/components/viz/money-flow";
import { AblationChart, DaysGap, EvalHeadline } from "@/components/viz/charts";
import { StateGrid } from "@/components/viz/state-grid";
import { SAMPLE_FLOW } from "@/lib/sample-flow";

const STEPS = [
  { icon: FileText, title: "Compile", who: "Claude proposes", body: "Reads the subcontract once and fills a fixed form: timing, retainage, release conditions, waivers, offsets. Every value comes with the clause it was read from." },
  { icon: ScanSearch, title: "Verify", who: "Code checks", body: "Finds each quote in the PDF, applies the governing state's law, and sends anything doubtful to the controller. One approval freezes the rules." },
  { icon: Waypoints, title: "Execute", who: "Engine runs", body: "When the owner pays, a deterministic engine splits the money, holds retainage, sets off backcharges, drafts waivers and starts the legal clock. No model touches the arithmetic." },
  { icon: Scale, title: "Show", who: "Everyone sees", body: "Subs and their suppliers see where their money is and when the law says it is due, without an account on the supplier's side." },
];

/** The front door: the problem, one payment moving, how it works, and the evidence. */
export default async function Landing() {
  const session = await auth();
  const run = latestEval();
  const c = coverage();
  const cta = session ? { href: homeFor(session.org.kind), label: "Open your workspace" } : { href: "/sign-in", label: "Open the demo" };
  return (
    <div className="flex flex-1 flex-col">
      <section className="bg-stage text-stage-foreground">
        <div className="mx-auto max-w-6xl px-5 sm:px-8">
          <header className="flex h-16 items-center justify-between">
            <Wordmark className="text-stage-foreground" />
            <nav className="flex items-center gap-6 text-sm text-stage-muted">
              <Link href="/statutes" className="hover:text-stage-foreground">
                Statutes
              </Link>
              <Link href="/api/v1" className="hidden hover:text-stage-foreground sm:inline">
                API
              </Link>
              <Link href={cta.href} className="font-medium text-stage-foreground">
                {session ? "Workspace" : "Sign in"}
              </Link>
            </nav>
          </header>
          <div className="grid gap-12 pb-20 pt-10 lg:grid-cols-[1.05fr_1fr] lg:items-center lg:pt-16">
            <div>
              <div className="type-label text-stage-muted">Construction payments</div>
              <h1 className="mt-4 font-serif text-5xl font-normal leading-[1.02] tracking-tight sm:text-6xl lg:text-7xl">The contract already says when the sub gets paid.</h1>
              <p className="mt-6 max-w-xl text-lg text-stage-foreground/80">Groundwork makes the money obey it. It compiles each subcontract into payment rules, and the moment the owner pays, every subcontractor&rsquo;s share is split, held, waived and on a legal clock.</p>
              <div className="mt-8 flex flex-wrap items-center gap-5">
                <Link href={cta.href} className="inline-flex h-11 items-center gap-2 rounded-full bg-stage-foreground px-6 text-sm font-semibold text-stage transition-transform active:scale-[0.97]">
                  {cta.label} <ArrowRight className="h-4 w-4" />
                </Link>
                <Link href="/statutes" className="text-sm text-stage-foreground underline decoration-stage-muted underline-offset-4">
                  Payment law in {c.jurisdictions} jurisdictions
                </Link>
              </div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 sm:p-8">
              <DaysGap onStage />
              <p className="mt-6 border-t border-white/10 pt-4 text-xs text-stage-muted">Median days to payment, US commercial construction. Built payment ledger, August 2026. The missing 33 days are a person re-reading a contract, doing retainage math in a spreadsheet and chasing a waiver by email.</p>
            </div>
          </div>
        </div>
      </section>

      <main className="mx-auto w-full max-w-6xl flex-1 px-5 sm:px-8">
        <section className="py-16" aria-labelledby="flow-h">
          <div className="type-label text-muted-foreground">One project, three owner payments</div>
          <h2 id="flow-h" className="mt-2 max-w-2xl text-3xl font-semibold leading-tight">Watch the owner&rsquo;s money find everyone it belongs to.</h2>
          <p className="mt-3 max-w-2xl text-muted-foreground">Each payment is split by the approved rules. Retainage is held, a backcharge is set off, and a supplier one hop down is paid out of its subcontractor&rsquo;s share. Orange is on its way; green has landed.</p>
          <div className="mt-8 rounded-2xl border bg-card p-5 shadow-card sm:p-8">
            <MoneyFlow flow={SAMPLE_FLOW} autoPlay height={380} />
          </div>
        </section>

        <section className="border-t py-16" aria-labelledby="how-h">
          <h2 id="how-h" className="text-3xl font-semibold">AI at the edges. A deterministic engine at the core.</h2>
          <ol className="mt-8 grid gap-px overflow-hidden rounded-2xl border bg-border shadow-card sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s, i) => (
              <li key={s.title} className="bg-card p-6">
                <div className="flex items-center justify-between">
                  <s.icon className="h-5 w-5 text-money" aria-hidden />
                  <span className="type-label text-muted-foreground">0{i + 1}</span>
                </div>
                <h3 className="mt-5 text-xl font-semibold">{s.title}</h3>
                <div className="type-label mt-1 text-muted-foreground">{s.who}</div>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{s.body}</p>
              </li>
            ))}
          </ol>
        </section>

        {run && (
          <section className="border-t py-16" aria-labelledby="eval-h">
            <div className="type-label text-muted-foreground">Measured, not claimed</div>
            <h2 id="eval-h" className="mt-2 max-w-2xl text-3xl font-semibold leading-tight">What happens when the model reads a contract wrong.</h2>
            <p className="mt-3 max-w-2xl text-muted-foreground">
              {run.metrics.contracts} subcontracts, including adversarial drafts and two real California forms. Each one has an answer key. The question is how many wrong values would reach the payment engine without a person being asked to look.
            </p>
            <div className="mt-8 space-y-8">
              <EvalHeadline run={run} />
              <div className="rounded-2xl border bg-card p-6 shadow-card">
                <AblationChart run={run} />
              </div>
            </div>
          </section>
        )}

        <section className="border-t py-16" aria-labelledby="law-h">
          <div className="type-label text-muted-foreground">{c.jurisdictions} jurisdictions</div>
          <h2 id="law-h" className="mt-2 max-w-2xl text-3xl font-semibold leading-tight">The law is applied by code, state by state, with its source.</h2>
          <p className="mt-3 max-w-2xl text-muted-foreground">
            {c.promptPay} states set a deadline to pay subcontractors. {c.retainageCap} cap or prohibit retainage. {c.payIfPaidVoid + c.payIfPaidLimited} void or limit pay-if-paid clauses. Where a rule could not be confirmed, the engine falls back to the contract and says so.
          </p>
          <div className="mt-8">
            <StateGrid states={STATES} />
          </div>
        </section>
      </main>

      <footer className="border-t bg-card">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-8 text-sm text-muted-foreground sm:px-8">
          <span>Groundwork · built for the BBS × Ramp hackathon. Demo data is synthetic; nothing here is legal advice.</span>
          <Link href={cta.href} className="font-medium text-foreground underline underline-offset-4">
            {cta.label}
          </Link>
        </div>
      </footer>
    </div>
  );
}
