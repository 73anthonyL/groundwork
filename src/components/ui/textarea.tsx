/** Textarea: grows with its content, at least three lines. All <textarea> props; styled like Input. */
import * as React from "react"
import { cn } from "cn"
import { fieldClasses } from "./input"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return <textarea data-slot="textarea" className={cn(fieldClasses, "field-sizing-content min-h-20 py-2 leading-5", className)} {...props} />
}

export { Textarea }
