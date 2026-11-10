/**
 * Panel: a white, 1px-bordered section with an optional header and actions. Use it for a group of
 * fields or a summary, not around every table: a Table already has its own frame.
 *
 *   <Panel title="Payment requirements" description="Every row must pass before money moves." actions={<Button size="sm" variant="secondary">Edit</Button>}>
 *     …
 *   </Panel>
 *
 * Props: `title?`, `description?`, `actions?`, `footer?` (a bordered strip at the bottom),
 * `padded` (default true; pass false to run a `<Table bare>` or a list edge to edge), `className?`.
 *
 * Section: the same heading row with no box, for content that sits straight on the page
 * (a heading, then a Table). Props: `title`, `description?`, `actions?`, `className?`.
 */
import * as React from "react"
import { cn } from "cn"

type HeadingProps = { title?: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode }

function Panel({
  title,
  description,
  actions,
  footer,
  padded = true,
  className,
  children,
  ...props
}: Omit<React.ComponentProps<"section">, "title"> & HeadingProps & { footer?: React.ReactNode; padded?: boolean }) {
  return (
    <section data-slot="panel" className={cn("overflow-hidden rounded-lg border bg-card", className)} {...props}>
      {(title || actions) && (
        <header className="flex min-h-12 flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b px-4 py-2.5">
          <div className="min-w-0">
            {title && <h2 className="text-sm leading-5 font-semibold">{title}</h2>}
            {description && <p className="type-meta text-muted-foreground">{description}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={padded ? "p-4" : undefined}>{children}</div>
      {footer && <footer className="border-t bg-muted/60 px-4 py-3">{footer}</footer>}
    </section>
  )
}

function Section({ title, description, actions, className, children, ...props }: Omit<React.ComponentProps<"section">, "title"> & HeadingProps) {
  return (
    <section data-slot="section" className={cn("flex flex-col gap-3", className)} {...props}>
      {(title || actions) && (
        <header className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
          <div className="min-w-0">
            {title && <h2 className="type-section">{title}</h2>}
            {description && <p className="type-meta mt-0.5 text-muted-foreground">{description}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  )
}

export { Panel, Section }
