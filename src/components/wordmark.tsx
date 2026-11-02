import Link from "next/link";

export function Wordmark({ href = "/", className = "" }: { href?: string; className?: string }) {
  return (
    <Link href={href} className={`inline-flex items-baseline gap-2 ${className}`} aria-label="Groundwork home">
      <span aria-hidden className="inline-block h-3 w-3 translate-y-px bg-money" />
      <span className="font-display text-xl font-semibold tracking-tight">Groundwork</span>
    </Link>
  );
}
