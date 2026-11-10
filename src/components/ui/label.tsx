/** Label: 14/500, sits above its field. All <label> props; pass `htmlFor`. */
import * as React from "react"
import { cn } from "cn"

function Label({ className, ...props }: React.ComponentProps<"label">) {
  return <label data-slot="label" className={cn("flex items-center gap-2 text-sm leading-5 font-medium text-foreground", className)} {...props} />
}

export { Label }
