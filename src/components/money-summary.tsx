/**
 * MoneySummary: the money on a page at a glance. One lead figure, then a bar split into where the
 * rest of the money is, with a figure under each part. Uses the same colors as the money flow chart.
 *
 *   <MoneySummary
 *     lead={{ label: "Owed to subcontractors now", value: "$158,500.00", hint: "4 payments, the first due Nov 17.", tone: "money" }}
 *     parts={[
 *       { label: "Paid to subcontractors", cents: 29800000, kind: "paid" },
 *       { label: "On its way", cents: 15850000, kind: "moving" },
 *       { label: "Retainage held", cents: 4200000, kind: "held" },
 *     ]}
 *     total={{ label: "Received from owner", cents: 50000000 }}
 *   />
 *
 * `parts` with zero cents keep their figure and get no slice of the bar. `total` is an optional
 * caption at the right end of the bar. Extra props (data-tour, aria-label) go on the section.
 */
import { cn } from "cn";
import { formatCents } from "@/lib/money";

export type MoneyKind = "paid" | "moving" | "held" | "setoff" | "idle";
const COLOR: Record<MoneyKind, string> = { paid: "var(--flow-paid)", moving: "var(--flow-moving)", held: "var(--flow-held)", setoff: "var(--flow-setoff)", idle: "var(--flow-idle)" };

export function MoneySummary({
  lead,
  parts,
  total,
  className,
  ...props
}: {
  lead: { label: React.ReactNode; value: React.ReactNode; hint?: React.ReactNode; tone?: "default" | "money" };
  parts: { label: string; cents: number; kind: MoneyKind; hint?: React.ReactNode }[];
  total?: { label: string; cents: number };
  className?: string;
} & Omit<React.ComponentProps<"section">, "children">) {
  const sum = parts.reduce((s, p) => s + Math.max(0, p.cents), 0);
  return (
    <section className={cn("grid gap-x-10 gap-y-6 rounded-lg border bg-card p-5 sm:p-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-center", className)} {...props}>
      <div className="min-w-0">
        <p className="type-meta text-muted-foreground">{lead.label}</p>
        <p className={cn("num type-figure mt-1", lead.tone === "money" && "text-money")}>{lead.value}</p>
        {lead.hint && <p className="mt-1 max-w-xl text-sm leading-5 text-muted-foreground">{lead.hint}</p>}
      </div>
      <div className="min-w-0">
        {sum > 0 && (
          <div
            role="img"
            aria-label={parts.filter((p) => p.cents > 0).map((p) => `${p.label} ${formatCents(p.cents)}`).join(", ")}
            className="flex h-3 gap-0.5 overflow-hidden rounded-full"
          >
            {parts
              .filter((p) => p.cents > 0)
              .map((p) => (
                <span key={p.label} className="h-full min-w-1.5 origin-left animate-[gw-grow_0.6s_var(--ease-out)_both]" style={{ flexGrow: p.cents, flexBasis: 0, background: COLOR[p.kind] }} />
              ))}
          </div>
        )}
        <dl className="mt-3 flex flex-wrap gap-x-8 gap-y-3">
          {parts.map((p) => (
            <div key={p.label} className="min-w-0">
              <dt className="type-meta flex items-center gap-1.5 text-muted-foreground">
                <span aria-hidden className="size-2 shrink-0 rounded-[2px]" style={{ background: COLOR[p.kind] }} />
                {p.label}
              </dt>
              <dd className="num mt-0.5 text-base leading-6 font-semibold">{formatCents(p.cents)}</dd>
              {p.hint && <dd className="type-meta mt-0.5 max-w-[26ch] text-muted-foreground">{p.hint}</dd>}
            </div>
          ))}
          {total && (
            <div className="min-w-0 sm:ml-auto sm:text-right">
              <dt className="type-meta text-muted-foreground">{total.label}</dt>
              <dd className="num mt-0.5 text-base leading-6 font-semibold">{formatCents(total.cents)}</dd>
            </div>
          )}
        </dl>
      </div>
    </section>
  );
}
