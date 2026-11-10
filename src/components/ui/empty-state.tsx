/**
 * EmptyState: what will appear here and the one action that starts it. Dashed by default, which is
 * also the placeholder for a section that has nothing to show yet.
 *
 *   <EmptyState title="No pay apps yet" description="They appear here when a subcontractor bills for a period." action={<Button variant="secondary">Invite a subcontractor</Button>} />
 *
 * Props: `title`, `description?`, `action?`, `icon?` (a lucide element), `variant` "dashed" (default) |
 * "plain" (no border, for inside a Panel), `align` "center" (default) | "start", `className?`.
 */
import * as React from "react"
import { cn } from "cn"

function EmptyState({
  title,
  description,
  action,
  icon,
  variant = "dashed",
  align = "center",
  className,
}: {
  title: React.ReactNode
  description?: React.ReactNode
  action?: React.ReactNode
  icon?: React.ReactNode
  variant?: "dashed" | "plain"
  align?: "center" | "start"
  className?: string
}) {
  return (
    <div
      data-slot="empty-state"
      className={cn(
        "flex flex-col gap-1 px-6 py-8",
        align === "center" ? "items-center text-center" : "items-start",
        variant === "dashed" && "rounded-lg border border-dashed border-input",
        className
      )}
    >
      {icon && <div className="mb-2 text-muted-foreground [&>svg]:size-5">{icon}</div>}
      <p className="text-sm leading-5 font-medium">{title}</p>
      {description && <p className="type-meta max-w-md text-muted-foreground">{description}</p>}
      {action && <div className="mt-3 flex flex-wrap items-center gap-2">{action}</div>}
    </div>
  )
}

export { EmptyState }
