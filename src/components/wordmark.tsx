import Link from "next/link";

/**
 * Wordmark: the name beside a small ink square. Inherits its color from the parent.
 * Props: `href` (default "/"), `className`.
 */
export function Wordmark({ href = "/", className = "" }: { href?: string; className?: string }) {
  return (
    <Link href={href} className={`inline-flex items-center gap-2 rounded-sm ${className}`} aria-label="Groundwork home">
      <span aria-hidden className="inline-block size-3 rounded-[3px] bg-current" />
      <span className="text-[15px] font-semibold leading-5 tracking-[-0.015em]">Groundwork</span>
    </Link>
  );
}
