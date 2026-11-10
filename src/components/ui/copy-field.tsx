"use client"

/**
 * CopyField: a read-only value with a Copy button, for invite links and waiver links.
 *
 *   <CopyField label="Invite link" value={url} help="Email sending is not connected; copy this link." />
 *
 * Props: `value`, `label?` (visible label; without one pass `ariaLabel`), `ariaLabel?`, `help?`, `className?`.
 * Clicking the field selects it all. The button says "Copied" for two seconds and announces it.
 */
import * as React from "react"
import { Check, Copy } from "lucide-react"
import { cn } from "cn"
import { Button } from "./button"
import { Input } from "./input"
import { Label } from "./label"

function CopyField({ value, label, ariaLabel, help, className }: { value: string; label?: React.ReactNode; ariaLabel?: string; help?: React.ReactNode; className?: string }) {
  const id = React.useId()
  const ref = React.useRef<HTMLInputElement>(null)
  const [copied, setCopied] = React.useState(false)
  React.useEffect(() => {
    if (!copied) return
    const t = setTimeout(() => setCopied(false), 2000)
    return () => clearTimeout(t)
  }, [copied])
  async function copy() {
    try {
      await navigator.clipboard.writeText(value)
    } catch {
      // No clipboard permission: select the text so Ctrl/Cmd+C works.
      ref.current?.select()
      return
    }
    setCopied(true)
  }
  return (
    <div data-slot="copy-field" className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      {label && <Label htmlFor={id}>{label}</Label>}
      <div className="flex gap-2">
        <Input ref={ref} id={id} readOnly value={value} aria-label={label ? undefined : (ariaLabel ?? "Value to copy")} aria-describedby={help ? `${id}-help` : undefined} onFocus={(e) => e.currentTarget.select()} className="type-mono truncate" />
        <Button type="button" variant="secondary" onClick={copy} className="h-9 w-[92px]">
          {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <span aria-live="polite" className="sr-only">
        {copied ? "Copied to clipboard" : ""}
      </span>
      {help && (
        <p id={`${id}-help`} className="type-meta text-muted-foreground">
          {help}
        </p>
      )}
    </div>
  )
}

export { CopyField }
