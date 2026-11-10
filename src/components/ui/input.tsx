/**
 * Input: a 36px text field. All <input> props. Set `aria-invalid` for the error border (Field does it for you).
 * Add className="type-mono" for amounts and IDs.
 */
import * as React from "react"
import { cn } from "cn"

export const fieldClasses =
  "w-full min-w-0 rounded-md border border-input bg-card px-3 text-base text-foreground placeholder:text-muted-foreground/80 focus-visible:border-ring focus-visible:-outline-offset-1 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground aria-invalid:border-destructive aria-invalid:focus-visible:outline-destructive read-only:bg-muted md:text-sm"

function Input({ className, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      data-slot="input"
      className={cn(fieldClasses, "h-9 file:mr-3 file:h-full file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground", className)}
      {...props}
    />
  )
}

export { Input }
