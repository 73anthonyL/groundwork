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
const LEAD = "text-[17px] leading-[1.6] text-muted-foreground";
const TEXT_LINK = "rounded-sm text-foreground underline decoration-input underline-offset-4 hover:decoration-foreground";
const HEADLINE = "The contract already says when to pay.";

const pct = (n: number) => (n === 1 ? "100%" : `${(n * 100).toFixed(1)}%`);
const runDate = (at: string) => new Date(`${at.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });

const STEPS = [
  { title: "Read", body: "Upload the signed subcontract. Groundwork reads 21 payment terms out of it and shows the clause and page each one came from.", fragment: <ReadFragment /> },
  { title: "Approve once", body: "Anything uncertain, or changed by state law, is put in front of you with its quote. You settle those terms and approve the rules a single time.", fragment: <ApproveFragment /> },
  { title: "Pay every time", body: "Each owner payment is checked against the same rules. When every requirement is met, the amount is already worked out and ready to send.", fragment: <PayFragment /> },
];

const LIMITS = [
  { title: "Test mode", body: "No real money moves yet. Payments run on a simulated rail, the way a payments sandbox does, so every step can be tried without a bank." },
  { title: "Not legal advice", body: "Groundwork applies the rules you approve. It does not tell you what your contract means or what you are entitled to." },
  { title: "Statute data is not lawyer-reviewed", body: "Each state rule was researched from published sources and carries its citation and a confidence level. Where the research could not confirm a rule, the contract's own terms apply and the page says so." },
  { title: "Text PDFs only", body: "A scanned subcontract cannot be read. Files are limited to 4 MB." },
  { title: "No email is sent", body: "Invitations and waiver requests are links you copy and send yourself." },
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
  const count = (category: string) => run?.contracts.filter((c) => c.category === category).length ?? 0;
  const primary = session ? { href: homeFor(session.org.kind), label: "Open Groundwork" } : { href: "/sign-up", label: "Create your account" };

  const cta = (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
      <Link href={primary.href} className={buttonVariants({ size: "lg", className: "px-5 text-[15px]" })}>
        {primary.label}
      </Link>
      <Link href="/sample" className={buttonVariants({ variant: "secondary", size: "lg", className: "px-5 text-[15px]" })}>
        Explore the sample workspace
      </Link>
    </div>
  );

  const faq = [
    {
      q: "Does the AI decide what gets paid?",
      a: "No. The model reads the subcontract and proposes each term with the clause it came from. Code checks every quote against the PDF and applies the state's payment law, a person approves, and a separate engine with no model in it does the arithmetic. The same inputs always produce the same payments.",
    },
    {
      q: "What happens when it reads a term wrong?",
      a: run
        ? `It happens: ${run.metrics.wrong} of ${run.metrics.fields} terms in the last evaluation. The checks flagged ${run.metrics.wrong - (run.layers.at(-1)?.silentErrors ?? 0)} of them for review. You see every term with its quote before approving, you can correct any of them, and nothing is paid from a subcontract whose rules have not been approved.`
        : "You see every term with its quote before approving, you can correct any of them, and nothing is paid from a subcontract whose rules have not been approved.",
    },
    {
      q: "Which contracts can it read?",
      a: "Subcontracts as text PDFs up to 4 MB, including long forms with exhibits and riders. It reads 21 payment terms: timing, retainage and its release, waivers, stored materials, backcharges and the rest. Scanned PDFs cannot be read yet.",
    },
    {
      q: "Which states does it cover?",
      a: `All 50 states and DC have a researched record with citations. ${cover.promptPay} set a deadline for paying subcontractors, ${cover.retainageCap} cap retainage and ${cover.payIfPaidVoid} void pay-if-paid clauses. Where a state is silent, the contract's terms apply.`,
    },
    {
      q: "What does a subcontractor have to do?",
      a: "Accept an invite link, bill for the period against the schedule of values, and sign a lien waiver when a payment is ready. A supplier one tier down signs its waiver from a link without an account.",
    },
    {
      q: "Does it move real money?",
      a: "Not yet. Groundwork runs in test mode on a simulated payment rail. Splits, retainage, waivers and deadlines all work as they would; no bank transfer is made.",
    },
  ];

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
            Groundwork reads each subcontract into payment rules you approve once, then splits every owner payment, holds retainage and starts each deadline the day the money arrives.
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
              <p className="type-body mt-6 text-muted-foreground">
                From the evaluation run of {runDate(run.at)}.{" "}
                <Link href="#accuracy" className={TEXT_LINK}>
                  How it was measured
                </Link>
              </p>
            </div>
          )}
        </section>

        {/* The one dark section: the problem, with its source. */}
        <section className="stage">
          <div className={`${WRAP} grid gap-x-16 gap-y-12 py-20 sm:py-28 lg:grid-cols-[1.1fr_1fr] lg:items-center`}>
            <div>
              <h2 className={H2}>The owner pays in 17 days. The sub who did the work waits 50.</h2>
              <p className="mt-6 max-w-[58ch] text-[17px] leading-[1.6] text-stage-muted">
                The missing 33 days are someone in the contractor&rsquo;s office re-reading a subcontract, working out retainage in a spreadsheet, chasing a lien waiver by email and cutting a check. None of that needs judgment. The contract and the law already decided it.
              </p>
            </div>
            <div>
              <DaysFragment />
              <p className="type-meta mt-8 text-stage-muted">Median days to payment, US commercial construction. Built payment ledger, August 2026.</p>
            </div>
          </div>
        </section>

        <Section id="how" className="border-t-0">
          <h2 className={`${H2} max-w-[20ch]`}>Read the contract once, then pay by it every time.</h2>
          <p className={`${LEAD} mt-6 max-w-[62ch]`}>The model only reads. A person approves what it read, and the money is worked out by plain code that gives the same answer every time.</p>
          <ol className="mt-14 grid gap-x-8 gap-y-14 lg:grid-cols-3">
            {STEPS.map((s, i) => (
              <li key={s.title} className="flex flex-col">
                <div className="flex items-baseline gap-3 border-t border-foreground pt-4">
                  <span className="type-mono text-[13px] text-muted-foreground">0{i + 1}</span>
                  <h3 className="text-[20px] font-medium leading-7 tracking-[-0.012em]">{s.title}</h3>
                </div>
                <p className="mt-2 max-w-[52ch] text-[15px] leading-[1.6] text-muted-foreground lg:min-h-24">{s.body}</p>
                <div className="mt-6">{s.fragment}</div>
              </li>
            ))}
          </ol>
        </Section>

        <Section>
          <div className="grid gap-x-16 gap-y-6 lg:grid-cols-[1fr_1fr] lg:items-end">
            <h2 className={`${H2} max-w-[20ch]`}>Every term arrives with its sentence, and code checks the sentence is real.</h2>
            <p className={`${LEAD} max-w-[58ch]`}>
              A term is only as good as the clause behind it. Groundwork searches the PDF for each quoted sentence, word for word, and flags any term whose quote it cannot find. You approve the contract&rsquo;s own words, set in the serif, not a summary of them.
            </p>
          </div>
          <div className="mt-12">
            <EvidenceFragment />
          </div>
        </Section>

        <Section>
          <div className="grid gap-x-16 gap-y-12 lg:grid-cols-[1fr_1.25fr] lg:items-start">
            <div>
              <h2 className={H2}>When the owner&rsquo;s payment lands, the paperwork is already moving.</h2>
              <p className={`${LEAD} mt-6 max-w-[56ch]`}>
                Record the payment and Groundwork does the rest of the morning&rsquo;s work in the same minute: each subcontractor&rsquo;s share, the retainage their contract holds back, the waiver on the right statutory form, and the deadline the contract and the state allow.
              </p>
              <p className={`${LEAD} mt-4 max-w-[56ch]`}>Every row keeps its time and the person who acted, so the owner, the contractor and the subcontractor read the same record.</p>
            </div>
            <ArrivalFragment />
          </div>
        </Section>

        {texas?.promptPay.days != null && (
          <Section>
            <div className="grid gap-x-16 gap-y-12 lg:grid-cols-[1.25fr_1fr] lg:items-start">
              <div className="lg:order-2">
                <h2 className={H2}>Where the state overrides the contract, the state&rsquo;s rule is the one applied.</h2>
                <p className={`${LEAD} mt-6 max-w-[56ch]`}>
                  A subcontract can say 30 days in a state that allows 7. Groundwork applies the governing state&rsquo;s payment law in code, shows the citation beside the term it changes, and leaves the decision to approve with you.
                </p>
                <p className={`${LEAD} mt-4 max-w-[56ch]`}>
                  The research covers {cover.jurisdictions} jurisdictions: {cover.promptPay} set a deadline for paying subcontractors, {cover.retainageCap} cap retainage, and {cover.payIfPaidVoid} void pay-if-paid clauses.{" "}
                  <Link href="/statutes" className={TEXT_LINK}>
                    See every state&rsquo;s rules
                  </Link>
                </p>
              </div>
              <LawFragment law={texas} />
            </div>
          </Section>
        )}

        {run && (
          <Section id="accuracy">
            <div className="grid gap-x-16 gap-y-6 lg:grid-cols-[1fr_1fr] lg:items-end">
              <h2 className={`${H2} max-w-[18ch]`}>We measured the reading, and we show every miss.</h2>
              <p className={`${LEAD} max-w-[58ch]`}>
                {run.metrics.contracts} subcontracts were labeled by hand, term by term: the {count("demo")} in the sample workspace, {count("clean")} plain ones, {count("adversarial")} written to be hard (terms buried in exhibits, riders that override the body, clauses that look like something they are not) and {count("real")} forms published by California general contractors. Groundwork read each one and its answers were compared with the labels.
              </p>
            </div>
            <div className="mt-12 grid gap-8 lg:grid-cols-2">
              <LayersFragment run={run} />
              <MissesFragment run={run} />
            </div>
            <div className="mt-12 grid gap-x-16 gap-y-6 lg:grid-cols-3">
              <p className="text-[15px] leading-[1.6] text-muted-foreground">
                <span className="font-medium text-foreground">
                  {run.metrics.fields - run.metrics.wrong} of {run.metrics.fields} terms were read correctly.
                </span>{" "}
                Of the {run.metrics.wrong} that were not, the checks flagged {run.metrics.wrong - (run.layers.at(-1)?.silentErrors ?? 0)}. The one that passed unflagged was a contractor&rsquo;s name read with its corporate suffix attached.
              </p>
              <p className="text-[15px] leading-[1.6] text-muted-foreground">
                <span className="font-medium text-foreground">Catching more means reviewing more.</span> With every check on, about {Math.round((run.layers.at(-1)?.burden ?? 0) * 100)}% of terms are marked for a second look. Those are the ones the review screen puts first.
              </p>
              <p className="text-[15px] leading-[1.6] text-muted-foreground">
                <span className="font-medium text-foreground">A person approves every rule.</span> No term reaches a payment on the model&rsquo;s word alone, flagged or not.{" "}
                <Link href="/api/v1/eval" className={TEXT_LINK}>
                  Read the full run as JSON
                </Link>
              </p>
            </div>
          </Section>
        )}

        <Section>
          <div className="grid gap-x-16 gap-y-10 lg:grid-cols-[1fr_1.25fr]">
            <h2 className={`${H2} max-w-[16ch]`}>What it does not do yet, stated plainly.</h2>
            <dl className="border-t">
              {LIMITS.map((l) => (
                <div key={l.title} className="grid gap-x-8 gap-y-1 border-b py-5 sm:grid-cols-[13rem_1fr]">
                  <dt className="text-[15px] font-medium leading-6">{l.title}</dt>
                  <dd className="max-w-[60ch] text-[15px] leading-[1.6] text-muted-foreground">{l.body}</dd>
                </div>
              ))}
            </dl>
          </div>
        </Section>

        <Section>
          <div className="grid gap-x-16 gap-y-10 lg:grid-cols-[1fr_1.25fr]">
            <h2 className={`${H2} max-w-[14ch]`}>Questions a controller asks first.</h2>
            <div className="border-t">
              {faq.map((f) => (
                <details key={f.q} className="group border-b">
                  <summary className="flex list-none items-center justify-between gap-6 rounded-sm py-5 text-[17px] font-medium leading-6 [&::-webkit-details-marker]:hidden">
                    {f.q}
                    <span aria-hidden className="relative size-3 shrink-0 text-muted-foreground">
                      <span className="absolute left-0 top-1/2 h-px w-3 bg-current" />
                      <span className="absolute left-1/2 top-0 h-3 w-px bg-current group-open:hidden" />
                    </span>
                  </summary>
                  <p className="max-w-[62ch] pb-6 text-[15px] leading-[1.6] text-muted-foreground">{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </Section>

        <Section>
          <h2 className={`${H1} max-w-[16ch]`}>{HEADLINE}</h2>
          <p className="mt-6 max-w-[56ch] text-[19px] leading-[1.5] text-muted-foreground">Upload one subcontract and see its payment rules, or open the sample project and follow an owner payment down to the subcontractor.</p>
          <div className="mt-8">{cta}</div>
        </Section>
      </main>

      <footer className="border-t bg-card">
        <div className={`${WRAP} grid gap-x-16 gap-y-10 py-14 md:grid-cols-[1.6fr_1fr_1fr]`}>
          <div>
            <Wordmark />
            <p className="type-meta mt-4 max-w-[46ch] text-muted-foreground">Groundwork is not a law firm and nothing here is legal advice. It runs in test mode: no real money moves. The sample workspace uses synthetic data.</p>
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
