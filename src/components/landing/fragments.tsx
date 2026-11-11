import { CountUp } from "@/components/in-view";

/**
 * Figures for the landing page, built in HTML from the product's own numbers. Not interactive: each
 * is a figure, and says so to assistive technology.
 */

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
