import Link from "next/link";
import { ArrowRight, Check, Clock, FileText, PenLine } from "lucide-react";
import { auth, homeFor } from "@/server/auth";
import { latestEval } from "@/server/read/eval";
import { Wordmark } from "@/components/wordmark";
import { buttonVariants } from "@/components/ui/button";
import { DaysFragment } from "@/components/landing/fragments";
import { SAMPLE_PAYMENT, type SamplePaymentLine } from "@/lib/sample-flow";
import { formatCentsCompact } from "@/lib/money";

/** Landing type, set here because it is larger than anything in the app. */
const WRAP = "mx-auto w-full max-w-[1120px] px-5 sm:px-8";
const H1 = "text-[clamp(2.25rem,1.35rem+3.9vw,3.75rem)] font-medium leading-[1.06] tracking-[-0.02em]";
const H2 = "text-[clamp(1.75rem,1.3rem+1.9vw,2.5rem)] font-medium leading-[1.12] tracking-[-0.015em]";
const HEADLINE = "When the owner pays, every subcontractor gets paid.";

const STEPS = [
  { title: "Upload the subcontract", body: "Groundwork reads its payment terms." },
  { title: "Approve the rules once", body: "You check them against the contract." },
  { title: "Record the owner's payment", body: "Each share, hold-back and deadline is worked out for you." },
];

/** One small picture per step: the file going in, the rules being approved, the payment coming out. */
const STEP_PICTURES = [
  <div key="upload" className="w-full max-w-[15rem] rounded-md border border-dashed border-input bg-card px-4 py-4">
    <div className="flex items-center gap-3">
      <FileText className="size-8 shrink-0 text-money" />
      <div className="min-w-0">
        <div className="truncate text-[14px] font-medium">subcontract.pdf</div>
        <div className="text-[12px] text-muted-foreground">7 pages</div>
      </div>
    </div>
    <div className="mt-3 h-1 overflow-hidden rounded-full bg-secondary">
      <div className="h-full w-2/3 rounded-full bg-signal" />
    </div>
  </div>,
  <ul key="approve" className="w-full max-w-[15rem] divide-y rounded-md border bg-card text-[14px]">
    {["Pay within 7 days", "Hold back 10%", "Waiver before payment"].map((r) => (
      <li key={r} className="flex items-center justify-between gap-3 px-3.5 py-2.5">
        <span>{r}</span>
        <Check className="size-4 shrink-0 text-money" />
      </li>
    ))}
  </ul>,
  <div key="pay" className="w-full max-w-[15rem]">
    <div className="flex items-baseline justify-between text-[14px]">
      <span className="text-muted-foreground">Owner payment</span>
      <span className="num font-semibold">$125,000</span>
    </div>
    <div className="mt-3 flex h-3 gap-1">
      <span className="rounded-sm bg-signal" style={{ width: "36%" }} />
      <span className="rounded-sm bg-signal/80" style={{ width: "38%" }} />
      <span className="rounded-sm bg-signal/60" style={{ width: "18%" }} />
      <span className="rounded-sm bg-primary" style={{ width: "8%" }} />
    </div>
    <div className="mt-3 flex justify-between text-[12px] text-muted-foreground">
      <span>3 subcontractors paid</span>
      <span>$10,000 held</span>
    </div>
  </div>,
];

const STATUS: Record<SamplePaymentLine["status"], { label: string; icon: typeof Check; tone: string }> = {
  paid: { label: "Paid", icon: Check, tone: "text-settled" },
  waiver: { label: "Waiting for their signature", icon: PenLine, tone: "text-muted-foreground" },
  due: { label: "Due in 7 days", icon: Clock, tone: "text-money" },
};

/** The product in one picture: one payment in, everyone's share out. */
function SplitPicture() {
  const p = SAMPLE_PAYMENT;
  return (
    <figure aria-label="One owner payment split between three subcontractors" className="rounded-lg border bg-card shadow-float">
      <div className="flex items-baseline justify-between gap-4 px-6 py-5">
        <span className="text-[15px] text-muted-foreground">The owner pays you</span>
        <span className="num text-[28px] font-semibold leading-none">{formatCentsCompact(p.amountCents)}</span>
      </div>
      <ul className="border-t">
        {p.lines.map((l, i) => {
          const s = STATUS[l.status];
          return (
            <li key={l.name} className="split-row flex items-center justify-between gap-4 border-b px-6 py-4" style={{ "--i": i } as React.CSSProperties}>
              <div className="min-w-0">
                <div className="text-[15px] font-medium">{l.name}</div>
                <div className={`mt-0.5 flex items-center gap-1.5 text-[13px] ${s.tone}`}>
                  <s.icon aria-hidden className="size-3.5" />
                  {s.label}
                </div>
              </div>
              <span className="num text-[17px] font-medium">{formatCentsCompact(l.netCents)}</span>
            </li>
          );
        })}
        <li className="split-row flex items-center justify-between gap-4 px-6 py-4 text-muted-foreground" style={{ "--i": p.lines.length } as React.CSSProperties}>
          <span className="text-[15px]">Held back until the job is done</span>
          <span className="num text-[17px]">{formatCentsCompact(p.retainageCents)}</span>
        </li>
      </ul>
      {/* The rows arrive one after another, once. Reduced motion shows them at once (see globals.css). */}
      <style>{`
        @keyframes gw-split { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
        .split-row { animation: gw-split 0.5s cubic-bezier(.16,1,.3,1) both; animation-delay: calc(var(--i) * 140ms + 300ms); }
      `}</style>
    </figure>
  );
}

/** The front door: what it does, why it matters, how it works. Nothing a first-time visitor has to decode. */
export default async function Landing() {
  const session = await auth();
  const run = latestEval();
  const primary = session ? { href: homeFor(session.org.kind), label: "Open Groundwork" } : { href: "/sign-up", label: "Create your account" };

  const cta = (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
      <Link href={primary.href} className={buttonVariants({ variant: "signal", size: "lg", className: "px-5 text-[15px]" })}>
        {primary.label}
      </Link>
      <Link href="/sample" className={buttonVariants({ variant: "secondary", size: "lg", className: "px-5 text-[15px]" })}>
        Try the sample
      </Link>
    </div>
  );

  return (
    <div className="flex flex-1 flex-col">
      <header className={`${WRAP} flex h-16 items-center justify-between gap-4`}>
        <Wordmark />
        <nav aria-label="Main" className="flex items-center gap-1 text-sm">
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
        <section className={`${WRAP} grid items-center gap-x-16 gap-y-12 pb-20 pt-12 sm:pb-28 sm:pt-20 lg:grid-cols-[1.1fr_1fr]`}>
          <div>
            <h1 className={H1}>{HEADLINE}</h1>
            <p className="mt-6 max-w-[44ch] text-[19px] leading-[1.5] text-muted-foreground">Groundwork reads your subcontracts and works out every payment: who gets what, what&rsquo;s held back, and when it&rsquo;s due.</p>
            <div className="mt-8">{cta}</div>
          </div>
          <SplitPicture />
        </section>

        <section className="stage">
          <div className={`${WRAP} grid gap-x-16 gap-y-12 py-20 sm:py-24 lg:grid-cols-2 lg:items-center`}>
            <h2 className={`${H2} max-w-[16ch]`}>The owner pays in 17 days. The sub waits 50.</h2>
            <div>
              <DaysFragment />
              <p className="type-meta mt-8 text-stage-muted">Median days to payment, US commercial construction. Built payment ledger, August 2026.</p>
            </div>
          </div>
        </section>

        <section id="how" className="scroll-mt-8">
          <div className={`${WRAP} py-20 sm:py-28`}>
            <h2 className={H2}>Three steps.</h2>
            <ol className="mt-12 grid gap-5 md:grid-cols-3">
              {STEPS.map((s, i) => (
                <li key={s.title} className="relative flex flex-col rounded-lg border bg-card">
                  {/* What the step looks like in the product. */}
                  <div aria-hidden className="flex h-44 items-center justify-center rounded-t-lg border-b bg-background/60 px-6">
                    {STEP_PICTURES[i]}
                  </div>
                  <div className="flex gap-4 p-6">
                    <span className="num flex size-8 shrink-0 items-center justify-center rounded-full bg-signal text-[15px] font-semibold text-signal-foreground">{i + 1}</span>
                    <div>
                      <h3 className="text-[19px] font-medium leading-7">{s.title}</h3>
                      <p className="mt-1 text-[15px] leading-6 text-muted-foreground">{s.body}</p>
                    </div>
                  </div>
                  {/* The arrow to the next step. */}
                  {i < STEPS.length - 1 && (
                    <span aria-hidden className="absolute -right-[27px] top-[5.5rem] z-10 hidden size-8 -translate-y-1/2 items-center justify-center rounded-full border bg-card text-muted-foreground md:flex">
                      <ArrowRight className="size-4" />
                    </span>
                  )}
                </li>
              ))}
            </ol>

            {run && (
              <dl className="mt-5 grid overflow-hidden rounded-lg border bg-card sm:grid-cols-3 sm:divide-x">
                {[
                  { value: `${(run.metrics.accuracy * 100).toFixed(1)}%`, label: "of contract terms read correctly" },
                  { value: String(run.metrics.fields), label: `terms tested across ${run.metrics.contracts} subcontracts` },
                  { value: "Every rule", label: "approved by you before anything is paid" },
                ].map((m) => (
                  <div key={m.label} className="flex flex-col border-b p-6 last:border-b-0 sm:border-b-0">
                    <dt className="order-2 mt-1 text-[15px] leading-6 text-muted-foreground">{m.label}</dt>
                    <dd className="num text-[32px] font-medium leading-none tracking-[-0.01em] text-money">{m.value}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>
        </section>

        <section className="border-t">
          <div className={`${WRAP} py-20 sm:py-28`}>
            <h2 className={`${H1} max-w-[18ch]`}>See it with your own subcontract.</h2>
            <div className="mt-8">{cta}</div>
          </div>
        </section>
      </main>

      <footer className="border-t">
        <div className={`${WRAP} flex flex-wrap items-center justify-between gap-x-8 gap-y-3 py-8`}>
          <Wordmark />
          <p className="type-meta text-muted-foreground">Test mode: no real money moves. Not legal advice. Built for the BBS and Ramp hackathon.</p>
        </div>
      </footer>
    </div>
  );
}
