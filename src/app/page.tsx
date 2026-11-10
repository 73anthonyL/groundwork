import Link from "next/link";
import { auth, homeFor } from "@/server/auth";
import { latestEval } from "@/server/read/eval";
import { STATES, coverage } from "@/domain/statutes";
import { Wordmark } from "@/components/wordmark";
import { ContractHero } from "@/components/landing/contract-hero";
import { MoneyFlow } from "@/components/viz/money-flow";
import { AblationChart, DaysGap } from "@/components/viz/charts";
import { StateGrid } from "@/components/viz/state-grid";
import { buttonVariants } from "@/components/ui/button";
import { SAMPLE_FLOW } from "@/lib/sample-flow";

/** The work, in order, and who does each part. It is a sequence, so it is numbered. */
const STEPS = [
  { who: "Claude", verb: "reads", body: "Once per subcontract. It fills a fixed form of 21 payment terms and must attach the clause each one came from." },
  { who: "Code", verb: "checks", body: "It looks for every quoted clause in the PDF, applies the governing state's payment law, and flags whatever it cannot stand behind." },
  { who: "A person", verb: "approves", body: "The controller settles the flagged terms and approves once. The rules are frozen and hashed." },
  { who: "The engine", verb: "pays", body: "When the owner pays, it splits the money, holds retainage, drafts each waiver and starts the legal clock. Same inputs, same result, every time." },
];

/** The front door: what the product does to one clause, the problem, one project's money, the evidence. */
export default async function Landing() {
  const session = await auth();
  const run = latestEval();
  const c = coverage();
  const cta = session ? { href: homeFor(session.org.kind), label: "Open your workspace" } : { href: "/sign-in", label: "Open the demo" };
  const prod = run?.layers[run.layers.length - 1];
  const trust = run?.layers[0];
  return (
    <div className="flex flex-1 flex-col bg-card">
      <header className="sticky top-0 z-30 border-b border-transparent bg-card/80 backdrop-blur-xl backdrop-saturate-150">
        <div className="mx-auto flex h-12 max-w-6xl items-center justify-between px-5 sm:px-8">
          <Wordmark />
          <nav className="flex items-center gap-1 text-[13px]">
            <Link href="/statutes" className="rounded-md px-2.5 py-1 text-muted-foreground transition-colors hover:text-foreground">
              Payment law
            </Link>
            <Link href="/api/v1" className="hidden rounded-md px-2.5 py-1 text-muted-foreground transition-colors hover:text-foreground sm:inline">
              API
            </Link>
            <Link href={cta.href} className={buttonVariants({ variant: "outline", size: "sm", className: "ml-2" })}>
              {session ? "Workspace" : "Sign in"}
            </Link>
          </nav>
        </div>
      </header>

      <section className="mx-auto w-full max-w-6xl px-5 pb-20 pt-14 sm:px-8 sm:pt-20">
        <h1 className="max-w-4xl text-[2.75rem] font-semibold leading-[1.04] tracking-[-0.03em] sm:text-6xl lg:text-7xl">The contract already says when the sub gets paid.</h1>
        <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground sm:text-xl">
          Groundwork reads the subcontract, turns its payment terms into rules a person approves once, and pays every subcontractor the moment the owner&rsquo;s money lands.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
          <Link href={cta.href} className={buttonVariants({ variant: "money", size: "lg", className: "h-11 rounded-full px-6" })}>
            {cta.label}
          </Link>
          <Link href="#how" className="text-[15px] text-link hover:underline">
            How it works
          </Link>
        </div>
        <div className="mt-14">
          <ContractHero />
        </div>
      </section>

      <section className="bg-background">
        <div className="mx-auto grid max-w-6xl gap-x-16 gap-y-10 px-5 py-24 sm:px-8 lg:grid-cols-[1fr_1.1fr] lg:items-center">
          <div>
            <h2 className="text-3xl font-semibold leading-tight sm:text-[2.5rem]">The owner pays in 17 days. The sub who did the work waits 50.</h2>
            <p className="mt-5 max-w-lg text-[17px] leading-relaxed text-muted-foreground">
              The missing 33 days are someone in the contractor&rsquo;s office re-reading a subcontract, doing retainage math in a spreadsheet, chasing a lien waiver by email and cutting a check. Nothing in that work needs judgment. The contract and the law already decided it.
            </p>
            <p className="mt-4 text-[13px] text-muted-foreground">Median days to payment, US commercial construction. Built payment ledger, August 2026.</p>
          </div>
          <DaysGap />
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-5 py-24 sm:px-8" aria-labelledby="flow-h">
        <h2 id="flow-h" className="max-w-2xl text-3xl font-semibold leading-tight sm:text-[2.5rem]">One project, three owner payments.</h2>
        <p className="mt-5 max-w-2xl text-[17px] leading-relaxed text-muted-foreground">
          Each payment is split by the approved rules as it arrives. Retainage is held back, a backcharge is set off, and a supplier one step down is paid out of its subcontractor&rsquo;s share. Orange is on its way. Green has landed.
        </p>
        <div className="mt-10 rounded-2xl bg-background p-5 sm:p-8" style={{ "--flow-surface": "var(--background)" } as React.CSSProperties}>
          <MoneyFlow flow={SAMPLE_FLOW} autoPlay height={380} />
        </div>
      </section>

      <section id="how" className="scroll-mt-16 bg-background">
        <div className="mx-auto grid max-w-6xl gap-x-16 gap-y-10 px-5 py-24 sm:px-8 lg:grid-cols-[1fr_1.4fr]">
          <div>
            <h2 className="text-3xl font-semibold leading-tight sm:text-[2.5rem]">The model reads. It never does the math.</h2>
            <p className="mt-5 text-[17px] leading-relaxed text-muted-foreground">A wrong sentence is cheap to catch. A wrong payment is not. So the model works only where a person or a program checks it, and the money runs on plain, repeatable code.</p>
          </div>
          <ol className="divide-y border-y">
            {STEPS.map((s, i) => (
              <li key={s.who} className="grid grid-cols-[2rem_1fr] gap-x-4 py-6 sm:grid-cols-[2rem_11rem_1fr]">
                <span className="num text-sm text-muted-foreground">{i + 1}</span>
                <h3 className="text-lg font-semibold">
                  {s.who} {s.verb}
                </h3>
                <p className="col-start-2 mt-1 text-[15px] leading-relaxed text-muted-foreground sm:col-start-3 sm:mt-0">{s.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {run && prod && trust && (
        <section className="mx-auto w-full max-w-6xl px-5 py-24 sm:px-8" aria-labelledby="eval-h">
          <h2 id="eval-h" className="max-w-3xl text-3xl font-semibold leading-tight sm:text-[2.5rem]">What happens when the model reads a contract wrong?</h2>
          <p className="mt-5 max-w-2xl text-[17px] leading-relaxed text-muted-foreground">
            We ran it on {run.metrics.contracts} subcontracts with answer keys, most of them written to mislead: payment terms buried in definitions, riders that override the body, two real California forms. It got {(run.metrics.accuracy * 100).toFixed(1)}% of {run.metrics.fields} terms right, and every clause it quoted was really in the document.
          </p>
          <p className="mt-4 max-w-2xl text-[17px] leading-relaxed">
            The number that matters is the wrong ones. Trust the model outright and {trust.silentErrors} wrong terms reach the payment engine with nobody asked to look. With every check on, {prod.silentErrors === 1 ? "1 does" : `${prod.silentErrors} do`}.
          </p>
          <div className="mt-10 max-w-4xl">
            <AblationChart run={run} />
          </div>
        </section>
      )}

      <section className="bg-background" aria-labelledby="law-h">
        <div className="mx-auto max-w-6xl px-5 py-24 sm:px-8">
          <h2 id="law-h" className="max-w-3xl text-3xl font-semibold leading-tight sm:text-[2.5rem]">The contract says one thing. The state may say another.</h2>
          <p className="mt-5 max-w-2xl text-[17px] leading-relaxed text-muted-foreground">
            {c.promptPay} states set a deadline for paying subcontractors. {c.retainageCap} cap or forbid retainage. {c.payIfPaidVoid + c.payIfPaidLimited} void or limit pay-if-paid clauses. Groundwork applies each state&rsquo;s rule in code, shows its source, and falls back to the contract where the law is silent.
          </p>
          <div className="mt-10">
            <StateGrid states={STATES} />
          </div>
        </div>
      </section>

      <footer className="border-t">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-8 text-[13px] text-muted-foreground sm:px-8">
          <span>Groundwork, built for the BBS and Ramp hackathon. The demo data is synthetic, and nothing here is legal advice.</span>
          <Link href={cta.href} className="font-medium text-link hover:underline">
            {cta.label}
          </Link>
        </div>
      </footer>
    </div>
  );
}
