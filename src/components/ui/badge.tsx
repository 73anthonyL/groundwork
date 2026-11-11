/**
 * Badge: a status in words. 20px high, 12/500, sentence case, tinted background, darker text and a
 * leading dot or icon, so the state never rests on color alone.
 *
 *   <Badge tone="settled">Paid</Badge>
 *   <Badge tone="hold" icon={<PenLine />}>Waiver requested</Badge>
 *
 * tone: "neutral" (default) | "money" (orange: money on its way, a clock running) | "settled"
 *   (green: paid, done) | "hold" (amber: waiting, held) | "danger" (red: failed, blocked) | "info" (blue).
 * icon: a lucide icon element to use in place of the dot. dot={false} removes the dot (counts, plain tags).
 */
import * as React from "react"
import { cn } from "cn"

export type BadgeTone = "neutral" | "money" | "settled" | "hold" | "danger" | "info"

const TONE: Record<BadgeTone, string> = {
  neutral: "text-muted-foreground",
  money: "text-money",
  settled: "text-settled",
  hold: "text-hold",
  danger: "text-destructive",
  info: "text-link",
}

function Badge({
  tone = "neutral",
  icon,
  dot = true,
  className,
  children,
  ...props
}: React.ComponentProps<"span"> & { tone?: BadgeTone; icon?: React.ReactNode; dot?: boolean }) {
  return (
    <span
      data-slot="badge"
      data-tone={tone}
      className={cn("inline-flex h-5 w-fit shrink-0 items-center gap-1.5 text-[13px] leading-5 font-medium whitespace-nowrap [&>svg]:size-3.5 [&>svg]:shrink-0", TONE[tone], className)}
      {...props}
    >
      {icon ?? (dot && <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-current" />)}
      {children}
    </span>
  )
}

export { Badge }
