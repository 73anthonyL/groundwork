import { Check, FileText } from "lucide-react";
import { CountUp } from "@/components/in-view";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { formatCents } from "@/lib/money";
import { SAMPLE_PAYMENT } from "@/lib/sample-flow";
import type { StateLaw } from "@/domain/statutes";
import type { EvalRun } from "@/server/read/eval";

/**
 * Pieces of the product rebuilt in HTML for the landing page. Each one shows the sample project's
 * real data (the Summit Drywall and Lonestar Mechanical subcontracts, the November 3 owner payment,
 * the latest evaluation run), so nothing here is a mock-up of a screen that says something else.
 * None of them is interactive: they are figures, and say so to assistive technology.
 */

/** A bordered product fragment with an optional title bar. */
export function Frame({ title, meta, label, className = "", children }: { title?: React.ReactNode; meta?: React.ReactNode; label: string; className?: string; children: React.ReactNode }) {
  return (
    <figure aria-label={label} className={`overflow-hidden rounded-lg border bg-card ${className}`}>
      {title && (
        <div className="flex min-h-11 items-center justify-between gap-3 border-b px-4 py-2 sm:px-5">
          <span className="type-body font-medium">{title}</span>
          {meta && <span className="type-meta shrink-0 text-muted-foreground">{meta}</span>}
        </div>
      )}
      {children}
    </figure>
  );
}

/** A clause reference: mono, never wraps. */
function Ref({ children }: { children: React.ReactNode }) {
  return <span className="type-mono whitespace-nowrap text-[12px] text-muted-foreground">{children}</span>;
}

function Tick() {
  return (
    <span aria-hidden className="mt-0.5 inline-flex size-4 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
      <Check className="size-2.5" strokeWidth={3} />
    </span>
  );
}

/* ---------- How it works: three steps ---------- */

/** Step 1: the uploaded file and the first of the 21 terms read from it. */
export function ReadFragment() {
  const terms = [
    { label: "Payment timing", value: "7 days after owner pays", ref: "§5.1, p. 3" },
    { label: "Retainage", value: "10% of each payment", ref: "§6.1, p. 3" },
    { label: "Pay app due", value: "20th of the month", ref: "§4.1, p. 2" },
    { label: "Stored materials", value: "Not paid until installed", ref: "§4.3, p. 2" },
  ];
  return (
    <Frame label="A subcontract PDF and four of the payment terms read from it">
      <div className="flex items-center gap-3 border-b px-4 py-3">
        <span aria-hidden className="inline-flex size-8 shrink-0 items-center justify-center rounded-md border bg-background text-muted-foreground">
          <FileText className="size-4" />
        </span>
        <div className="min-w-0">
          <div className="type-body truncate font-medium">summit-drywall.pdf</div>
          <div className="type-caption text-muted-foreground">7 pages, 21 payment terms read</div>
        </div>
      </div>
      <ul className="divide-y">
        {terms.map((t) => (
          <li key={t.label} className="grid grid-cols-[1fr_auto] items-baseline gap-x-3 px-4 py-2.5">
            <span className="type-caption text-muted-foreground">{t.label}</span>
            <Ref>{t.ref}</Ref>
            <span className="type-body col-span-2">{t.value}</span>
          </li>
        ))}
      </ul>
      <div className="type-caption border-t bg-background px-4 py-2.5 text-muted-foreground">and 17 more, each with its quote</div>
    </Frame>
  );
}

/** Step 2: the one term that needed a person, and the single approval. */
export function ApproveFragment() {
  return (
    <Frame label="A flagged term with its quote, and the approval bar">
      <div className="px-4 py-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="type-body font-medium">Pay-if-paid clause</span>
          <Badge tone="hold">Needs your decision</Badge>
        </div>
        <blockquote className="type-contract mt-2.5 border-l-2 border-input pl-3 text-[14px] leading-[1.55]">
          Contractor&rsquo;s receipt of payment from Owner for the Subcontract Work is a condition precedent to Contractor&rsquo;s obligation to make any progress payment
        </blockquote>
        <div className="mt-2 text-right">
          <Ref>§5.2, p. 3</Ref>
        </div>
        <p className="type-meta mt-2 text-muted-foreground">Void in California. Read as pay-when-paid; the 7-day deadline still runs.</p>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t bg-background px-4 py-3">
        <span className="type-meta text-muted-foreground">
          <span className="num font-medium text-foreground">21 of 21</span> confirmed
        </span>
        <span className="inline-flex h-8 items-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground">Approve payment rules</span>
      </div>
    </Frame>
  );
}

/** Step 3: the payment requirements for one pay app, each with where it comes from. */
export function PayFragment() {
  const summit = SAMPLE_PAYMENT.lines.find((l) => l.name === "Summit Drywall");
  const rows = [
    { text: "Owner payment received", ref: SAMPLE_PAYMENT.reference },
    { text: "Pay app matches the schedule of values", ref: "Exhibit B" },
    { text: "Conditional waiver signed", ref: "§4.2" },
    { text: "10% retainage held", ref: "§6.1" },
  ];
  return (
    <Frame label="The payment requirements for one payment, all met">
      <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
        <span className="type-body font-medium">Payment requirements</span>
        <span className="type-meta num text-muted-foreground">4 of 4 met</span>
      </div>
      <ul className="divide-y">
        {rows.map((r) => (
          <li key={r.text} className="flex items-start gap-2.5 px-4 py-2.5">
            <Tick />
            <span className="type-body min-w-0 flex-1">{r.text}</span>
            <Ref>{r.ref}</Ref>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t bg-background px-4 py-3">
        <span className="type-meta text-muted-foreground">Ready to pay Summit Drywall</span>
        <span className="type-mono type-body font-medium">{summit ? formatCents(summit.netCents) : ""}</span>
      </div>
    </Frame>
  );
}

/* ---------- Evidence: terms beside their quotes ---------- */

/** Six of the 21 terms read from the Summit Drywall subcontract. Every quote is verbatim from the PDF. */
const EVIDENCE = [
  { term: "Payment timing", value: "Within 7 days of the owner's payment", quote: "within seven (7) days after Contractor receives payment from Owner", ref: "§5.1, p. 3" },
  { term: "Retainage", value: "10% of each progress payment", quote: "retention equal to ten percent (10%) of the amount otherwise due to Subcontractor", ref: "§6.1, p. 3" },
  { term: "Retainage release", value: "Within 10 days of the owner releasing it", quote: "in no event later than ten (10) days after Contractor receives from Owner the retention attributable to the Subcontract Work", ref: "§6.2, p. 3" },
  { term: "Waiver with each pay app", value: "Conditional, on the statutory form", quote: "a conditional waiver and release on progress payment, in the form prescribed by California Civil Code Section 8132", ref: "§4.2, p. 2" },
  { term: "Stored materials", value: "Not paid until installed", quote: "No payment shall be made on account of materials or equipment delivered to the site", ref: "§4.3, p. 2" },
  { term: "Backcharge markup", value: "Cost plus 15%, after 5 business days' notice", quote: "plus fifteen percent (15%) for overhead and profit", ref: "§8.2, p. 4" },
];

export function EvidenceFragment() {
  return (
    <Frame label="Six payment terms from the Summit Drywall subcontract, each beside the sentence it was read from" title="Summit Drywall subcontract" meta="6 of 21 terms">
      <div className="type-meta hidden grid-cols-[minmax(0,1.1fr)_minmax(0,1.9fr)_auto] gap-x-8 border-b px-5 py-2 font-medium text-muted-foreground md:grid">
        <span>Term read</span>
        <span>The contract says</span>
        <span className="w-28 text-right">Found in the PDF</span>
      </div>
      <ul className="divide-y">
        {EVIDENCE.map((e) => (
          <li key={e.term} className="grid gap-x-8 gap-y-2 px-4 py-3.5 sm:px-5 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1.9fr)_auto] md:items-baseline">
            <div>
              <div className="type-caption text-muted-foreground">{e.term}</div>
              <div className="type-body mt-0.5 font-medium">{e.value}</div>
            </div>
            <blockquote className="type-contract text-[15px] leading-[1.55]">&ldquo;{e.quote}&rdquo;</blockquote>
            <div className="flex items-center gap-2 md:w-28 md:justify-end">
              <Ref>{e.ref}</Ref>
              <Check aria-hidden className="size-3.5 shrink-0 text-settled" strokeWidth={2.5} />
              <span className="sr-only">found word for word</span>
            </div>
          </li>
        ))}
      </ul>
    </Frame>
  );
}

/* ---------- What happens when an owner payment arrives ---------- */

type Step = { time: string; title: string; detail: React.ReactNode; badge: string; tone: BadgeTone; amount?: number };

export function ArrivalFragment() {
  const p = SAMPLE_PAYMENT;
  const summit = p.lines.find((l) => l.name === "Summit Drywall");
  if (!summit) return null;
  const steps: Step[] = [
    { time: "Nov 3, 10:00 AM", title: "Owner payment received", detail: <>Bayview Health, {p.reference}</>, badge: "Received", tone: "settled", amount: p.amountCents },
    { time: "10:00 AM", title: "Retainage held", detail: <>10% of {formatCents(summit.grossCents)} billed, under §6.1</>, badge: "Held", tone: "hold", amount: summit.grossCents - summit.netCents },
    { time: "10:00 AM", title: "Conditional waiver requested", detail: "Civ. Code §8132 form, sent to Summit Drywall", badge: "Signed 2:41 PM", tone: "settled" },
    { time: "10:00 AM", title: "Deadline started", detail: "7 days under §5.1. Pay by Nov 10.", badge: "6 days left", tone: "money" },
    { time: "Nov 4, 9:12 AM", title: "Payment sent", detail: "To Summit Drywall, approved by the controller", badge: "On its way", tone: "money", amount: summit.netCents },
  ];
  return (
    <Frame label="The five things that happened to Summit Drywall's share of one owner payment, with times" title="Summit Drywall, payment 2" meta="Bayview Clinic TI">
      <ol>
        {steps.map((s, i) => (
          <li key={s.title} className="relative grid grid-cols-[1rem_minmax(0,1fr)] gap-x-3 px-4 sm:grid-cols-[7.5rem_1rem_minmax(0,1fr)] sm:px-5">
            <span className="type-mono hidden pt-3.5 text-[12px] leading-5 text-muted-foreground sm:block">{s.time}</span>
            <span aria-hidden className="relative flex justify-center">
              {i > 0 && <span className="absolute top-0 h-4 w-px bg-border" />}
              {i < steps.length - 1 && <span className="absolute bottom-0 top-4 w-px bg-border" />}
              <span className={`relative mt-[1.125rem] size-2.5 rounded-full ${i === steps.length - 1 ? "bg-signal" : "bg-primary"}`} />
            </span>
            <div className={`grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-0.5 py-3 ${i < steps.length - 1 ? "border-b" : ""}`}>
              <span className="type-body font-medium">{s.title}</span>
              <span className="type-mono type-body text-right">{s.amount != null ? formatCents(s.amount) : ""}</span>
              <span className="type-meta text-muted-foreground">
                <span className="type-mono block text-[12px] sm:hidden">{s.time}</span>
                {s.detail}
              </span>
              <span className="row-start-3 mt-1.5 sm:col-start-2 sm:row-start-2 sm:mt-0 sm:justify-self-end">
                <Badge tone={s.tone}>{s.badge}</Badge>
              </span>
            </div>
          </li>
        ))}
      </ol>
    </Frame>
  );
}

/** The 17-day and 50-day medians as two measured bars on the dark section. */
export function DaysFragment() {
  const rows = [
    { label: "The contractor is paid by the owner", days: 17 },
    { label: "The subcontractor is paid by the contractor", days: 50 },
  ];
  return (
    <figure aria-label="Median days to payment: 17 for the contractor, 50 for the subcontractor">
      <dl className="space-y-7">
        {rows.map((r) => (
          <div key={r.label}>
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-[15px] leading-6 text-stage-muted">{r.label}</dt>
              <dd className="num text-[15px] leading-6 text-stage-muted">
                <CountUp value={r.days} className="mr-1.5 text-[40px] font-medium leading-none tracking-[-0.02em] text-stage-foreground" />days
              </dd>
            </div>
            <div aria-hidden className="mt-3 h-1.5 rounded-full bg-stage-foreground/10">
              <div className={`iv-grow h-full rounded-full ${r.days > 17 ? "bg-signal" : "bg-stage-foreground"}`} style={{ width: `${(r.days / 50) * 100}%`, "--i": r.days > 17 ? 4 : 0 } as React.CSSProperties} />
            </div>
          </div>
        ))}
      </dl>
    </figure>
  );
}

/* ---------- The law ---------- */

/** One term from the Texas sample subcontract beside the statute that overrides it. */
export function LawFragment({ law }: { law: StateLaw }) {
  const days = law.promptPay.days;
  return (
    <Frame label={`A 30-day payment term beside the ${law.name} statute that shortens it`} title="Payment timing" meta={<Badge tone="info">Statute applied</Badge>}>
      <div className="grid sm:grid-cols-2">
        <div className="border-b px-4 py-4 sm:border-b-0 sm:border-r sm:px-5">
          <div className="type-caption text-muted-foreground">The contract says</div>
          <blockquote className="type-contract mt-2 text-[15px] leading-[1.55]">&ldquo;Contractor will pay Subcontractor within thirty (30) days after Contractor&rsquo;s receipt of that payment.&rdquo;</blockquote>
          <div className="mt-3">
            <Ref>Lonestar Mechanical, §5.4, p. 3</Ref>
          </div>
        </div>
        <div className="px-4 py-4 sm:px-5">
          <div className="type-caption text-muted-foreground">{law.name} says</div>
          <p className="type-body mt-2">
            Pay each subcontractor within {days} days of receiving the owner&rsquo;s payment.{law.promptPay.contractCanOverride === false ? " A contract cannot lengthen this." : ""}
          </p>
          <div className="mt-3">
            {law.promptPay.url ? (
              <a href={law.promptPay.url} target="_blank" rel="noreferrer" className="type-mono text-[12px] text-link underline-offset-4 hover:underline">
                {law.promptPay.cite}
              </a>
            ) : (
              <Ref>{law.promptPay.cite}</Ref>
            )}
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-t bg-background px-4 py-3 sm:px-5">
        <span className="type-meta text-muted-foreground">Rule the controller approves</span>
        <span className="type-body font-medium">
          Pay within {days} days <span className="font-normal text-muted-foreground line-through">30 days</span>
        </span>
      </div>
    </Frame>
  );
}

/* ---------- Accuracy and method ---------- */

const LAYER_TEXT: Record<string, string> = {
  L0: "The model on its own",
  L1: "Add: flag what the model is unsure of",
  L2: "Add: find every quote in the PDF",
  L3: "Add: state law and out-of-range checks",
};

/** How many wrong terms would reach a payment without a flag, as each check is added. */
export function LayersFragment({ run }: { run: EvalRun }) {
  const max = Math.max(1, ...run.layers.map((l) => l.silentErrors));
  return (
    <Frame label="Wrong terms left unflagged as each check is added" title="Wrong terms nobody was warned about" meta={<span className="num">of {run.metrics.fields}</span>}>
      <ul className="divide-y">
        {run.layers.map((l, i) => (
          <li key={l.id} className="grid grid-cols-[minmax(0,1fr)_2rem] items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-5">
            <span className={`type-body ${i === run.layers.length - 1 ? "font-medium" : ""}`}>{LAYER_TEXT[l.id] ?? l.label}</span>
            <span className="type-mono text-right text-[17px] font-medium leading-6">{l.silentErrors}</span>
            <span aria-hidden className="col-span-2 flex gap-1">
              {Array.from({ length: max }, (_, k) => (
                <span key={k} className={`h-1.5 flex-1 rounded-full ${k < l.silentErrors ? "bg-primary" : "bg-secondary"}`} />
              ))}
            </span>
          </li>
        ))}
      </ul>
      <div className="type-meta border-t bg-background px-4 py-3 text-muted-foreground sm:px-5">The last row is what runs in the product.</div>
    </Frame>
  );
}

const PATH_TEXT: Record<string, string> = {
  "retainage.release_condition": "Retainage release condition",
  "retainage.reduction_trigger": "When retainage steps down",
  "parties.contractor": "Contractor's legal name",
  "timing.type": "Pay-when-paid or pay-if-paid",
};
const CATEGORY_TEXT: Record<string, string> = { demo: "Sample contract", adversarial: "Written to be hard", clean: "Plain contract", real: "Published contractor form" };

/** Every term the run got wrong, and whether the checks warned the reviewer. */
export function MissesFragment({ run }: { run: EvalRun }) {
  const category = new Map(run.contracts.map((c) => [c.slug, c.category]));
  return (
    <Frame label="Every term the evaluation got wrong" title="Every miss in the run" meta={<span className="num">{run.misses.length} of {run.metrics.fields}</span>}>
      <ul className="divide-y">
        {run.misses.map((m) => (
          <li key={`${m.slug}:${m.path}`} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 px-4 py-2.5 sm:px-5">
            <div className="min-w-0">
              <div className="type-body">{PATH_TEXT[m.path] ?? m.path}</div>
              <div className="type-caption text-muted-foreground">{CATEGORY_TEXT[category.get(m.slug) ?? ""] ?? "Contract"}</div>
            </div>
            {m.flagged ? <Badge tone="settled">Flagged for review</Badge> : <Badge tone="danger">Not flagged</Badge>}
          </li>
        ))}
      </ul>
    </Frame>
  );
}
