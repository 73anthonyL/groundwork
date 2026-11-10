import { Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatBps, formatCents } from "@/lib/money";
import { SAMPLE_PAYMENT, type SamplePaymentLine } from "@/lib/sample-flow";

/**
 * The product in one picture, built from the sample project's own data: page 3 of the Summit Drywall
 * subcontract with its two payment sentences marked, the two rules they became, and what those rules
 * did to the owner's November 3 payment.
 *
 * One sequence on load: a sentence is marked, its rule appears, then the payment splits. It is plain
 * CSS, so the server and the browser render the same markup, and the site-wide reduced-motion rule
 * lands every piece on its finished state at once.
 *
 * The contract's words are set in the serif; everything Groundwork says is in the sans.
 */

/** Seconds from load at which each piece starts. */
const AT = { mark1: 0.5, rule1: 1.1, mark2: 1.6, rule2: 2.2, law: 2.7, split: 3.1 };
const delay = (s: number) => ({ "--d": `${s}s` }) as React.CSSProperties;

const CSS = `
@keyframes lp-mark { from { background-size: 0% 100%; } to { background-size: 100% 100%; } }
@keyframes lp-rise { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
.lp-mark {
  color: inherit;
  background-color: transparent;
  background-image: linear-gradient(var(--lp-mark-color), var(--lp-mark-color));
  background-repeat: no-repeat;
  background-size: 100% 100%;
  -webkit-box-decoration-break: clone;
  box-decoration-break: clone;
  border-radius: 2px;
  padding: 2px 0;
  animation: lp-mark 0.7s cubic-bezier(0.65, 0, 0.35, 1) both;
  animation-delay: var(--d, 0s);
}
.lp-in { animation: lp-rise 0.5s cubic-bezier(0.16, 1, 0.3, 1) both; animation-delay: var(--d, 0s); }
`;

function Mark({ n, at, children }: { n: number; at: number; children: React.ReactNode }) {
  return (
    <mark className="lp-mark" style={delay(at)}>
      {children}
      <sup className="ml-0.5 font-sans text-[10px] font-semibold text-link">{n}</sup>
    </mark>
  );
}

function Rule({ n, at, label, value, source, children }: { n: number; at: number; label: string; value: string; source: string; children: React.ReactNode }) {
  return (
    <li className="lp-in grid grid-cols-[1.25rem_1fr] gap-x-2 px-5 py-4" style={delay(at)}>
      <span className="num pt-px text-[12px] font-semibold leading-5 text-link">{n}</span>
      <div className="min-w-0">
        <div className="flex items-baseline justify-between gap-3">
          <span className="type-meta text-muted-foreground">{label}</span>
          <span className="type-mono text-[12px] text-muted-foreground">{source}</span>
        </div>
        <div className="mt-0.5 text-[17px] font-medium leading-6 tracking-[-0.01em]">{value}</div>
        <div className="type-meta mt-1.5 text-muted-foreground">{children}</div>
      </div>
    </li>
  );
}

const STATUS: Record<SamplePaymentLine["status"], React.ReactNode> = {
  paid: <Badge tone="settled">Paid</Badge>,
  waiver: <Badge tone="hold">Waiver requested</Badge>,
  due: <Badge tone="money">Due Nov 10</Badge>,
};

export function ContractHero() {
  const p = SAMPLE_PAYMENT;
  return (
    <figure aria-label="A subcontract clause, the payment rules read from it, and one owner payment split by those rules" className="grid overflow-hidden rounded-lg border bg-card shadow-float md:grid-cols-2 lg:grid-cols-[1.22fr_0.9fr_1.12fr]">
      <style href="gw-landing-hero" precedence="default">
        {CSS}
      </style>

      {/* The contract page. */}
      <div className="border-b bg-paper px-5 py-5 text-paper-ink sm:px-8 sm:py-7 md:col-span-2 lg:col-span-1 lg:border-b-0 lg:border-r" style={{ "--lp-mark-color": "color-mix(in oklch, var(--link) 15%, transparent)" } as React.CSSProperties}>
        <div className="type-caption flex items-baseline justify-between gap-4 text-paper-muted">
          <span>Subcontract MB-25-0412-S03</span>
          <span className="num shrink-0">Page 3 of 7</span>
        </div>
        <div className="type-contract mt-5 space-y-3.5 text-[15px] leading-[1.62] sm:text-[16px]">
          <p className="font-sans text-[12px] font-medium tracking-[0.04em]">ARTICLE 5 — PROGRESS PAYMENTS</p>
          <p>
            5.1 Subject to the other provisions of this Subcontract, Contractor shall pay Subcontractor,{" "}
            <Mark n={1} at={AT.mark1}>
              within seven (7) days after Contractor receives payment from Owner
            </Mark>{" "}
            on account of the Subcontract Work covered by Subcontractor&rsquo;s application, the amount approved by Owner and Contractor for that Subcontract Work, less retention withheld under Article 6 &hellip;
          </p>
          <p className="pt-2 font-sans text-[12px] font-medium tracking-[0.04em]">ARTICLE 6 — RETENTION</p>
          <p>
            6.1 Contractor shall withhold from each progress payment{" "}
            <Mark n={2} at={AT.mark2}>
              retention equal to ten percent (10%) of the amount otherwise due
            </Mark>{" "}
            to Subcontractor.
          </p>
        </div>
      </div>

      {/* The rules it became. */}
      <div className="flex flex-col border-b md:border-b-0 md:border-r">
        <div className="flex h-11 items-center justify-between gap-3 border-b px-5">
          <span className="type-body font-medium">Payment rules</span>
          <Badge tone="settled" icon={<Check aria-hidden />}>
            Approved
          </Badge>
        </div>
        <ol className="divide-y">
          <Rule n={1} at={AT.rule1} label="Pay within" value="7 days of the owner&rsquo;s payment" source="§5.1, p. 3">
            Quote found word for word in the PDF.
          </Rule>
          <Rule n={2} at={AT.rule2} label="Retainage" value="10% held from each payment" source="§6.1, p. 3">
            Quote found word for word in the PDF.
          </Rule>
        </ol>
        <p className="lp-in type-meta mt-auto border-t bg-background px-5 py-3.5 text-muted-foreground" style={delay(AT.law)}>
          California checked: 7 days is the state&rsquo;s own limit, and this contract predates the 5% retainage cap. Both rules stand.
        </p>
      </div>

      {/* What the rules did to one owner payment. */}
      <div className="flex flex-col">
        <div className="flex h-11 items-center justify-between gap-3 border-b px-5">
          <span className="type-body font-medium">Owner payment</span>
          <span className="type-mono text-[12px] text-muted-foreground">{p.reference}</span>
        </div>
        <div className="flex items-baseline justify-between gap-3 px-5 pb-3 pt-4">
          <span className="type-meta whitespace-nowrap text-muted-foreground">Received {p.received}</span>
          <span className="type-mono text-[17px] font-medium leading-7 sm:text-[20px]">{formatCents(p.amountCents)}</span>
        </div>
        <ul className="divide-y border-t">
          {p.lines.map((l, i) => (
            <li key={l.name} className="lp-in grid grid-cols-[1fr_auto] gap-x-3 px-5 py-2.5" style={delay(AT.split + i * 0.09)}>
              <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                <span className="type-body font-medium">{l.name}</span>
                {STATUS[l.status]}
              </div>
              <span className="type-mono type-body text-right">{formatCents(l.netCents)}</span>
              <span className="type-caption col-span-2 mt-0.5 text-muted-foreground">
                <span className="num">{formatCents(l.grossCents)}</span> billed, less {formatBps(l.retainageBps)} retainage
              </span>
            </li>
          ))}
          <li className="lp-in grid grid-cols-[1fr_auto] gap-x-3 px-5 py-2.5" style={delay(AT.split + p.lines.length * 0.09)}>
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
              <span className="type-body font-medium">Retainage</span>
              <Badge tone="hold">Held</Badge>
            </div>
            <span className="type-mono type-body text-right">{formatCents(p.retainageCents)}</span>
          </li>
        </ul>
        <div className="lp-in type-meta mt-auto flex items-baseline justify-between gap-3 border-t bg-background px-5 py-3.5 text-muted-foreground" style={delay(AT.split + (p.lines.length + 1) * 0.09)}>
          <span>Every dollar accounted for</span>
          <span className="type-mono text-foreground">{formatCents(p.lines.reduce((s, l) => s + l.netCents, p.retainageCents))}</span>
        </div>
      </div>
    </figure>
  );
}
