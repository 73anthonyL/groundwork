import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { auth, homeFor } from "@/server/auth";
import { latestEval } from "@/server/read/eval";
import { STATE_LAW, coverage } from "@/domain/statutes";
import { Wordmark } from "@/components/wordmark";
import { buttonVariants } from "@/components/ui/button";
import { ContractHero } from "@/components/landing/contract-hero";
import { ApproveFragment, ArrivalFragment, DaysFragment, EvidenceFragment, LawFragment, LayersFragment, MissesFragment, PayFragment, ReadFragment } from "@/components/landing/fragments";

/** Landing type, set here because it is larger than anything in the app. */
const WRAP = "mx-auto w-full max-w-[1200px] px-4 sm:px-8";
const H1 = "text-[clamp(2.25rem,1.35rem+3.9vw,4rem)] font-medium leading-[1.05] tracking-[-0.02em]";
const H2 = "text-[clamp(1.75rem,1.3rem+1.9vw,2.75rem)] font-medium leading-[1.1] tracking-[-0.02em]";
const TEXT_LINK = "rounded-sm text-foreground underline decoration-input underline-offset-4 hover:decoration-foreground";
const HEADLINE = "The contract already says when to pay.";

const pct = (n: number) => (n === 1 ? "100%" : `${(n * 100).toFixed(1)}%`);
const runDate = (at: string) => new Date(`${at.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });

const STEPS = [
  { title: "Read", body: "Upload the signed subcontract.", fragment: <ReadFragment /> },
  { title: "Approve once", body: "Settle what's flagged. Approve the rules.", fragment: <ApproveFragment /> },
  { title: "Pay every time", body: "Each owner payment splits itself.", fragment: <PayFragment /> },
];

function Section({ id, className = "", children }: { id?: string; className?: string; children: React.ReactNode }) {
  return (
    <section id={id} className={`scroll-mt-8 border-t ${className}`}>
      <div className={`${WRAP} py-20 sm:py-28`}>{children}</div>
    </section>
  );
}

/** The front door: what the product does to one clause, the evidence behind it, and what it does not do. */
export default async function Landing() {
  const session = await auth();
  const run = latestEval();
  const cover = coverage();
  const texas = STATE_LAW.TX;
  const primary = session ? { href: homeFor(session.org.kind), label: "Open Groundwork" } : { href: "/sign-up", label: "Create your account" };

  const cta = (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
      <Link href={primary.href} className={buttonVariants({ variant: "signal", size: "lg", className: "px-5 text-[15px]" })}>
        {primary.label}
      </Link>
      <Link href="/sample" className={buttonVariants({ variant: "secondary", size: "lg", className: "px-5 text-[15px]" })}>
        Explore the sample workspace
      </Link>
    </div>
  );

  return (
    <div className="flex flex-1 flex-col bg-background">
      <header className={`${WRAP} flex h-16 items-center justify-between gap-4`}>
        <Wordmark />
        <nav aria-label="Main" className="flex items-center gap-1 text-sm">
          <Link href="#how" className="hidden rounded-md px-3 py-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground md:block">
            How it works
          </Link>
          <Link href="#accuracy" className="hidden rounded-md px-3 py-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground md:block">
            Accuracy
          </Link>
          {!session && (
            <Link href="/sign-in" className="rounded-md px-3 py-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground">
              Sign in
            </Link>
          )}
          <Link href={primary.href} className={buttonVariants({ size: "md", className: "ml-2" })}>
            {session ? primary.label : "Create account"}
          </Link>
        </nav>
      </header>

      <main>
        <section className={`${WRAP} pb-16 pt-14 sm:pb-20 sm:pt-24`}>
          <h1 className={`${H1} max-w-[16ch]`}>{HEADLINE}</h1>
          <p className="mt-6 max-w-[60ch] text-[19px] leading-[1.5] text-muted-foreground">
            Upload a subcontract. Approve its payment rules once. Every owner payment splits itself.
          </p>
          <div className="mt-8">{cta}</div>
          <div className="mt-14 sm:mt-16">
            <ContractHero />
          </div>

          {run && (
            <div className="mt-16 sm:mt-20">
              <dl className="grid grid-cols-2 gap-x-6 gap-y-8 lg:grid-cols-4">
                {[
                  { value: String(run.metrics.contracts), label: "subcontracts read" },
                  { value: String(run.metrics.fields), label: "payment terms checked" },
                  { value: pct(run.metrics.accuracy), label: "terms read correctly" },
                  { value: pct(run.metrics.quoteVerifiedRate), label: "quotes found in the PDF" },
                ].map((s) => (
                  <div key={s.label} className="flex flex-col border-t pt-4">
                    <dt className="order-2 mt-1 text-[15px] leading-6 text-muted-foreground">{s.label}</dt>
                    <dd className="num text-[clamp(2.5rem,2rem+1.6vw,3rem)] font-medium leading-[1.1] tracking-[-0.02em]">{s.value}</dd>
                  </div>
                ))}
              </dl>
              <p className="type-meta mt-6 text-muted-foreground">
                Evaluation run, {runDate(run.at)}.{" "}
                <Link href="#accuracy" className={TEXT_LINK}>
                  Method
                </Link>
              </p>
            </div>
          )}
        </section>

        {/* The one dark section: the problem, with its source. */}
        <section className="stage">
          <div className={`${WRAP} grid gap-x-16 gap-y-12 py-20 sm:py-28 lg:grid-cols-[1fr_1fr] lg:items-center`}>
            <h2 className={`${H2} max-w-[16ch]`}>The owner pays in 17 days. The sub waits 50.</h2>
            <div>
              <DaysFragment />
              <p className="type-meta mt-8 text-stage-muted">Median days to payment, US commercial construction. Built payment ledger, August 2026.</p>
            </div>
          </div>
        </section>

        <Section id="how" className="border-t-0">
          <h2 className={`${H2} max-w-[20ch]`}>Read once. Approve once. Pay every time.</h2>
          <ol className="mt-14 grid gap-x-8 gap-y-14 lg:grid-cols-3">
            {STEPS.map((s, i) => (
              <li key={s.title} className="flex flex-col">
                <div className="flex items-baseline gap-3 border-t border-foreground pt-4">
                  <span className="type-mono text-[13px] text-muted-foreground">0{i + 1}</span>
                  <h3 className="text-[20px] font-medium leading-7 tracking-[-0.012em]">{s.title}</h3>
                </div>
                <p className="mt-2 text-[15px] leading-6 text-muted-foreground">{s.body}</p>
                <div className="mt-6">{s.fragment}</div>
              </li>
            ))}
          </ol>
        </Section>

        <Section>
          <h2 className={`${H2} max-w-[18ch]`}>Every term comes with its clause.</h2>
          <div className="mt-12">
            <EvidenceFragment />
          </div>
        </Section>

        <Section>
          <div className="grid gap-x-16 gap-y-12 lg:grid-cols-[1fr_1.25fr] lg:items-start">
            <h2 className={`${H2} max-w-[14ch]`}>The owner pays. The rest is already moving.</h2>
            <ArrivalFragment />
          </div>
        </Section>

        {texas?.promptPay.days != null && (
          <Section>
            <div className="grid gap-x-16 gap-y-12 lg:grid-cols-[1.25fr_1fr] lg:items-start">
              <div className="lg:order-2">
                <h2 className={`${H2} max-w-[14ch]`}>Where state law beats the contract, it wins.</h2>
                <p className="mt-6 text-[15px] leading-6 text-muted-foreground">
                  {cover.jurisdictions} jurisdictions, each with its citation.{" "}
                  <Link href="/statutes" className={TEXT_LINK}>
                    See every state
                  </Link>
                </p>
              </div>
              <LawFragment law={texas} />
            </div>
          </Section>
        )}

        {run && (
          <Section id="accuracy">
            <h2 className={`${H2} max-w-[18ch]`}>Measured. Every miss shown.</h2>
            <div className="mt-12 grid gap-8 lg:grid-cols-2">
              <LayersFragment run={run} />
              <MissesFragment run={run} />
            </div>
            <p className="mt-8 text-[15px] leading-6 text-muted-foreground">
              {run.metrics.contracts} hand-labeled subcontracts. A person approves every rule.{" "}
              <Link href="/api/v1/eval" className={TEXT_LINK}>
                Full run as JSON
              </Link>
            </p>
          </Section>
        )}

        <Section>
          <h2 className={`${H1} max-w-[16ch]`}>{HEADLINE}</h2>
          <div className="mt-8">{cta}</div>
        </Section>
      </main>

      <footer className="border-t bg-card">
        <div className={`${WRAP} grid gap-x-16 gap-y-10 py-14 md:grid-cols-[1.6fr_1fr_1fr]`}>
          <div>
            <Wordmark />
            <p className="type-meta mt-4 max-w-[46ch] text-muted-foreground">Test mode: no real money moves. Not legal advice.</p>
            <p className="type-meta mt-3 text-muted-foreground">Built for the BBS and Ramp hackathon.</p>
          </div>
          <nav aria-label="Product">
            <h2 className="type-meta font-medium">Product</h2>
            <ul className="type-body mt-3 space-y-2 text-muted-foreground">
              {[
                { href: "#how", label: "How it works" },
                { href: "#accuracy", label: "Accuracy and method" },
                { href: "/statutes", label: "State payment rules" },
                { href: "/sample", label: "Sample workspace" },
              ].map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="rounded-sm underline-offset-4 hover:text-foreground hover:underline">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <nav aria-label="Account">
            <h2 className="type-meta font-medium">Account</h2>
            <ul className="type-body mt-3 space-y-2 text-muted-foreground">
              <li>
                <Link href="/sign-in" className="rounded-sm underline-offset-4 hover:text-foreground hover:underline">
                  Sign in
                </Link>
              </li>
              <li>
                <Link href={primary.href} className="inline-flex items-center gap-1 rounded-sm underline-offset-4 hover:text-foreground hover:underline">
                  {primary.label}
                  <ArrowRight aria-hidden className="size-3.5" />
                </Link>
              </li>
            </ul>
          </nav>
        </div>
      </footer>
    </div>
  );
}
