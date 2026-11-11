import Link from "next/link";

/**
 * The Groundwork mark: a letter G drawn like a foundation plan, in square strokes with right angles.
 * The G's crossbar ends in a vermilion square, the survey marker everything is measured from.
 *
 *   <Mark size={20} />     // inherits its color from the parent; the marker is always vermilion
 *
 * The same drawing, on an ink tile, is the browser icon (src/app/icon.svg).
 */
export function Mark({ size = 18, className = "" }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden focusable="false" className={className}>
      <path d="M20 8.5V4H4v16h16v-8h-5.5" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="square" strokeLinejoin="miter" />
      <rect x="9.6" y="9.6" width="4.8" height="4.8" fill="var(--signal)" />
    </svg>
  );
}

/**
 * Wordmark: the mark beside the name. Inherits its color from the parent.
 * Props: `href` (default "/"), `className`.
 */
export function Wordmark({ href = "/", className = "" }: { href?: string; className?: string }) {
  return (
    <Link href={href} className={`inline-flex items-center gap-2 rounded-sm ${className}`} aria-label="Groundwork home">
      <Mark />
      <span className="text-[15px] font-semibold leading-5 tracking-[-0.015em]">Groundwork</span>
    </Link>
  );
}
