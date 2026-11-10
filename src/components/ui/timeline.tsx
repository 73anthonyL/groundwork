/**
 * Timeline: what happened, who did it and when; also what has not happened yet.
 *
 *   <Timeline events={[
 *     { actor: "Priya Raman", verb: "recorded the owner payment", time: "Nov 3, 9:14 AM", state: "done" },
 *     { actor: "Apex Electric", verb: "was asked for a conditional waiver", time: "Nov 3, 9:14 AM", state: "current", detail: <Countdown … /> },
 *     { verb: "Payment sent", state: "todo" },
 *   ]} />
 *
 * Props: `events` ({ verb, actor?, time?, state?: "done" (default) | "current" | "todo" | "failed",
 * icon? (a lucide element that replaces the marker's glyph), detail?, id? }[]), `className?`.
 * Markers: done = ink tick, current = orange dot (in progress), todo = hollow, failed = red cross.
 * Each state also has screen-reader text, so it is never color alone. Newest-first or oldest-first is the caller's order.
 */
import * as React from "react"
import { Check, X } from "lucide-react"
import { cn } from "cn"

export type TimelineEvent = {
  id?: string
  verb: React.ReactNode
  actor?: React.ReactNode
  time?: React.ReactNode
  state?: "done" | "current" | "todo" | "failed"
  icon?: React.ReactNode
  detail?: React.ReactNode
}

const MARK = {
  done: "bg-primary text-primary-foreground",
  current: "border-[1.5px] border-money bg-card text-money",
  todo: "border border-input bg-card text-muted-foreground",
  failed: "bg-destructive text-destructive-foreground",
} as const
const SR = { done: "", current: "In progress: ", todo: "Not yet: ", failed: "Failed: " } as const

function Timeline({ events, className }: { events: TimelineEvent[]; className?: string }) {
  return (
    <ol data-slot="timeline" className={cn("flex flex-col", className)}>
      {events.map((e, i) => {
        const state = e.state ?? "done"
        const last = i === events.length - 1
        return (
          <li key={e.id ?? i} className="relative flex gap-3 pb-4 last:pb-0">
            {!last && <span aria-hidden className="absolute top-5 bottom-0 left-[9.5px] w-px bg-border" />}
            <span aria-hidden className={cn("relative mt-px flex size-5 shrink-0 items-center justify-center rounded-full [&>svg]:size-3", MARK[state])}>
              {e.icon ?? (state === "done" ? <Check strokeWidth={3} /> : state === "failed" ? <X strokeWidth={3} /> : state === "current" ? <span className="size-1.5 rounded-full bg-signal" /> : null)}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4">
                <p className={cn("text-sm leading-5", state === "todo" && "text-muted-foreground")}>
                  <span className="sr-only">{SR[state]}</span>
                  {e.actor && <span className="font-medium">{e.actor} </span>}
                  {e.verb}
                </p>
                {e.time && <time className="type-caption num shrink-0 text-muted-foreground">{e.time}</time>}
              </div>
              {e.detail && <div className="type-meta mt-0.5 text-muted-foreground">{e.detail}</div>}
            </div>
          </li>
        )
      })}
    </ol>
  )
}

export { Timeline }
