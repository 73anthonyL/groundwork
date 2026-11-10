/**
 * Spinner: a 16px ring that inherits the text color. Under reduced motion it pulses instead of turning.
 * Props: `className` (size with size-*), `label` (default "Loading"), `decorative` (hide from
 * screen readers when the text beside it already says what is happening).
 */
import { cn } from "cn"

export function Spinner({ className, label = "Loading", decorative = false }: { className?: string; label?: string; decorative?: boolean }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      className={cn("waiting-ring size-4 shrink-0 animate-spin", className)}
      {...(decorative ? { "aria-hidden": true } : { role: "status", "aria-label": label })}
    >
      <circle cx="8" cy="8" r="6.25" stroke="currentColor" strokeOpacity="0.25" strokeWidth="1.5" />
      <path d="M14.25 8A6.25 6.25 0 0 0 8 1.75" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}
