import Link from "next/link";
import { auth, homeFor } from "@/server/auth";
import { Wordmark } from "@/components/wordmark";
import { ContractHero } from "@/components/landing/contract-hero";
import { MoneyFlow } from "@/components/viz/money-flow";
import { DaysGap } from "@/components/viz/charts";
import { SAMPLE_FLOW } from "@/lib/sample-flow";

/** The work, in order, and who does each part. It is a sequence, so it is numbered. */
const STEPS = [
  { who: "Claude", verb: "reads", body: "You upload a subcontract. Claude pulls out its payment terms and shows the clause each one came from." },
  { who: "Code", verb: "checks", body: "It finds every quoted clause in the PDF, applies the state's payment deadline, and flags anything it is unsure of." },
  { who: "A person", verb: "approves", body: "The controller settles the flagged terms and approves once. The rules are frozen and hashed." },
  { who: "The engine", verb: "pays", body: "When the owner pays, it splits the money, holds retainage, drafts each waiver and starts the legal clock. Same inputs, same result, every time." },
];

/** The front door: what the product does to one clause, the problem, how it works, one project's money. */
export default async function Landing() {
  const session = await auth();
  const cta = session ? { href: homeFor(session.org.kind), label: "Open your workspace" } : { href: "/sign-in", label: "Open the demo" };
  return (
    <div className="flex flex-1 flex-col bg-card">
      {/* The opening: the dark stage, and the contract page laid on top of it. */}
      <div className="stage">
        <header className="mx-auto flex h-14 max-w-6xl items-center justify-between px-5 sm:px-8">
          <Wordmark />
          <nav className="flex items-center gap-1 text-[13px]">
            <Link href={cta.href} className="ml-2 rounded-md border border-white/30 px-3 py-1 font-medium text-white transition-colors hover:bg-white/10">
              {session ? "Workspace" : "Sign in"}
            </Link>
          </nav>
        </header>
        <section className="mx-auto w-full max-w-6xl px-5 pb-56 pt-14 sm:px-8 sm:pt-20">
          <h1 className="reveal max-w-5xl text-[2.6rem] font-bold leading-[1.02] tracking-[-0.03em] sm:text-6xl lg:text-[4.75rem]">The contract already says when the sub gets paid.</h1>
          <p className="reveal mt-7 max-w-2xl text-lg leading-relaxed text-stage-muted sm:text-xl" style={{ "--i": 1 } as React.CSSProperties}>
            Groundwork reads the subcontract, turns its payment terms into rules a person approves once, and pays every subcontractor the moment the owner&rsquo;s money lands.
          </p>
          <div className="reveal mt-9 flex flex-wrap items-center gap-x-6 gap-y-3" style={{ "--i": 2 } as React.CSSProperties}>
            <Link href={cta.href} className="inline-flex h-11 items-center rounded-full bg-signal px-6 text-[15px] font-semibold text-signal-foreground transition-[transform,filter] hover:brightness-105 active:scale-[0.97]">
              {cta.label}
            </Link>
            <Link href="#how" className="text-[15px] text-white underline decoration-white/40 underline-offset-4 hover:decoration-white">
              How it works
            </Link>
          </div>
        </section>
      </div>
      <div className="reveal mx-auto -mt-44 w-full max-w-6xl px-5 pb-24 sm:px-8" style={{ "--i": 3 } as React.CSSProperties}>
        <ContractHero />
      </div>

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

      <section id="how" className="scroll-mt-16">
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

      <section className="bg-background" aria-labelledby="flow-h">
        <div className="mx-auto w-full max-w-6xl px-5 py-24 sm:px-8">
        <h2 id="flow-h" className="max-w-2xl text-3xl font-semibold leading-tight sm:text-[2.5rem]">One project, three owner payments.</h2>
        <p className="mt-5 max-w-2xl text-[17px] leading-relaxed text-muted-foreground">
          Each payment is split by the approved rules as it arrives. Retainage is held back, a backcharge is set off, and a supplier one step down is paid out of its subcontractor&rsquo;s share. Orange is on its way. Green has landed.
        </p>
        <div className="mt-10 rounded-2xl bg-card p-5 shadow-card sm:p-8">
          <MoneyFlow flow={SAMPLE_FLOW} autoPlay height={380} />
        </div>
        </div>
      </section>

      <footer className="stage">
        <div className="mx-auto max-w-6xl px-5 pb-10 pt-24 sm:px-8">
          <h2 className="max-w-3xl text-4xl font-bold leading-[1.05] sm:text-5xl">See one owner payment become four.</h2>
          <p className="mt-5 max-w-xl text-[17px] leading-relaxed text-stage-muted">The demo runs a real project from signed subcontract to paid subcontractor. Pick a seat and follow the money.</p>
          <Link href={cta.href} className="mt-8 inline-flex h-11 items-center rounded-full bg-signal px-6 text-[15px] font-semibold text-signal-foreground transition-[transform,filter] hover:brightness-105 active:scale-[0.97]">
            {cta.label}
          </Link>
          <p className="mt-20 border-t border-white/10 pt-6 text-[13px] text-stage-muted">Groundwork, built for the BBS and Ramp hackathon. The demo data is synthetic, and nothing here is legal advice.</p>
        </div>
      </footer>
    </div>
  );
}
