/**
 * Checklist: numbered steps with a count; the current step is open and carries the single action.
 *
 *   <Checklist
 *     title="Set up your first project"
 *     steps={[
 *       { title: "Create a project", state: "done" },
 *       { title: "Upload a subcontract", state: "current", description: "A signed PDF with selectable text.", action: <Button>Upload subcontract</Button> },
 *       { title: "Approve its payment rules", state: "todo" },
 *     ]}
 *   />
 *
 * Props: `steps` ({ title, state: "done" | "current" | "todo", description?, action?, id? }[]),
 * `title?`, `className?`. The count ("1 of 3") is the number done. Only the current step shows its
 * description and action. Done is a tick and the word "Done" for screen readers, not color alone.
 */
import * as React from "react"
import { Check } from "lucide-react"
import { cn } from "cn"

export type ChecklistStep = {
  id?: string
  title: React.ReactNode
  state: "done" | "current" | "todo"
  description?: React.ReactNode
  action?: React.ReactNode
}

function Checklist({ steps, title, className }: { steps: ChecklistStep[]; title?: React.ReactNode; className?: string }) {
  const done = steps.filter((s) => s.state === "done").length
  return (
    <div data-slot="checklist" className={cn("overflow-hidden rounded-lg border bg-card", className)}>
      <div className="flex items-center justify-between gap-4 border-b px-4 py-2.5">
        {title ? <h2 className="text-sm leading-5 font-semibold">{title}</h2> : <span />}
        <span className="type-meta num text-muted-foreground">
          {done} of {steps.length}
        </span>
      </div>
      <ol>
        {steps.map((s, i) => (
          <li key={s.id ?? i} aria-current={s.state === "current" ? "step" : undefined} className="flex gap-3 border-b px-4 py-3 last:border-0">
            <span
              aria-hidden
              className={cn(
                "num mt-px flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] leading-none font-medium",
                s.state === "done" && "bg-primary text-primary-foreground",
                s.state === "current" && "border-[1.5px] border-foreground text-foreground",
                s.state === "todo" && "border border-input text-muted-foreground"
              )}
            >
              {s.state === "done" ? <Check className="size-3" strokeWidth={3} /> : i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className={cn("text-sm leading-5", s.state === "current" ? "font-medium" : "text-muted-foreground")}>
                {s.title}
                {s.state === "done" && <span className="sr-only"> (Done)</span>}
              </p>
              {s.state === "current" && s.description && <p className="type-meta mt-0.5 text-muted-foreground">{s.description}</p>}
              {s.state === "current" && s.action && <div className="mt-3 flex flex-wrap items-center gap-2">{s.action}</div>}
            </div>
          </li>
        ))}
      </ol>
    </div>
  )
}

export { Checklist }
