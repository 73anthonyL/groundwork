/**
 * Stat: a label and a figure.
 *
 *   <StatGroup>
 *     <Stat label="Retainage held" value="$48,200.00" hint="Released at substantial completion" />
 *     <Stat label="Paid to date" value="$1.2M" tone="settled" />
 *   </StatGroup>
 *   <Stat size="lg" label="Owed to subcontractors now" value="$184,300.00" />   // the page's single money figure, 28/36
 *
 * Props: `label`, `value`, `hint?`, `size` "md" (default, 16/24) | "lg" (28/36, once per page),
 * `tone?` "default" | "money" | "settled" | "hold" | "danger" (colors the figure; use only when it is a state).
 * StatGroup lays stats out in a bordered row that wraps to a 2-column grid on phones.
 */
import * as React from "react"
import { cn } from "cn"

const TONE = { default: "text-foreground", money: "text-money", settled: "text-settled", hold: "text-hold", danger: "text-destructive" } as const

function Stat({
  label,
  value,
  hint,
  size = "md",
  tone = "default",
  className,
}: {
  label: React.ReactNode
  value: React.ReactNode
  hint?: React.ReactNode
  size?: "md" | "lg"
  tone?: keyof typeof TONE
  className?: string
}) {
  return (
    <div data-slot="stat" className={cn("min-w-0", className)}>
      <dt className="type-meta text-muted-foreground">{label}</dt>
      <dd className={cn("num", size === "lg" ? "type-figure mt-1" : "mt-0.5 text-base leading-6 font-semibold", TONE[tone])}>{value}</dd>
      {hint && <dd className="type-meta mt-0.5 text-muted-foreground">{hint}</dd>}
    </div>
  )
}

function StatGroup({ className, ...props }: React.ComponentProps<"dl">) {
  return (
    <dl
      data-slot="stat-group"
      className={cn("grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border sm:flex [&>[data-slot=stat]]:flex-1 [&>[data-slot=stat]]:bg-card [&>[data-slot=stat]]:px-4 [&>[data-slot=stat]]:py-3 [&>[data-slot=stat]:last-child:nth-child(odd)]:col-span-2", className)}
      {...props}
    />
  )
}

export { Stat, StatGroup }
