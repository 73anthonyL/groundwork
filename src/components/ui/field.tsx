/**
 * Field: label above, control, 13px help below, and the error right beside the field.
 *
 *   <Field label="Contract sum" help="Before change orders." error={errors.sum}>
 *     <Input name="sum" inputMode="decimal" />
 *   </Field>
 *
 * Give it ONE control as its child. Field gives that control an id (unless it has one), points the
 * label at it, and sets aria-describedby and aria-invalid, so nothing needs wiring by hand.
 * Props: `label`, `help?`, `error?` (string or node; falsy means no error), `optional?` (adds
 * "Optional" after the label), `className?`.
 * `FormActions` is the row at the foot of a form: right-aligned, Cancel first, then the primary button.
 */
import * as React from "react"
import { CircleAlert } from "lucide-react"
import { cn } from "cn"
import { Label } from "./label"

type ControlProps = { id?: string; "aria-describedby"?: string; "aria-invalid"?: boolean | "true" | "false" }

function Field({
  label,
  help,
  error,
  optional,
  className,
  children,
}: {
  label: React.ReactNode
  help?: React.ReactNode
  error?: React.ReactNode
  optional?: boolean
  className?: string
  children: React.ReactNode
}) {
  const auto = React.useId()
  const child = React.isValidElement<ControlProps>(children) ? children : null
  const id = child?.props.id ?? auto
  const helpId = help ? `${id}-help` : undefined
  const errorId = error ? `${id}-error` : undefined
  const describedBy = [child?.props["aria-describedby"], errorId, helpId].filter(Boolean).join(" ") || undefined
  return (
    <div data-slot="field" className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <Label htmlFor={id}>
        {label}
        {optional && <span className="font-normal text-muted-foreground">Optional</span>}
      </Label>
      {child ? React.cloneElement(child, { id, "aria-describedby": describedBy, "aria-invalid": error ? true : child.props["aria-invalid"] }) : children}
      {error && (
        <p id={errorId} role="alert" className="type-meta flex items-start gap-1.5 text-destructive">
          <CircleAlert aria-hidden className="mt-px size-4 shrink-0" />
          <span>{error}</span>
        </p>
      )}
      {help && (
        <p id={helpId} className="type-meta text-muted-foreground">
          {help}
        </p>
      )}
    </div>
  )
}

function FormActions({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="form-actions" className={cn("flex flex-wrap items-center justify-end gap-2 pt-2", className)} {...props} />
}

export { Field, FormActions }
