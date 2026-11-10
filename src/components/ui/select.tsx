/**
 * Select: the native <select>, styled like Input (36px) with a chevron. All <select> props.
 *
 *   <Select name="state" defaultValue="CA"><option value="CA">California</option></Select>
 *
 * `className` goes on the <select>; `wrapperClassName` on the box around it (for width).
 */
import * as React from "react"
import { ChevronDown } from "lucide-react"
import { cn } from "cn"
import { fieldClasses } from "./input"

function Select({ className, wrapperClassName, children, ...props }: React.ComponentProps<"select"> & { wrapperClassName?: string }) {
  return (
    <span className={cn("relative block w-full", wrapperClassName)}>
      <select data-slot="select" className={cn(fieldClasses, "h-9 appearance-none pr-9", className)} {...props}>
        {children}
      </select>
      <ChevronDown aria-hidden className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground" />
    </span>
  )
}

export { Select }
