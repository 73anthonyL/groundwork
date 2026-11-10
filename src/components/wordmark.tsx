import Link from "next/link";

export function Wordmark({ href = "/", className = "" }: { href?: string; className?: string }) {
  return (
    <Link href={href} className={`inline-flex items-baseline gap-2 ${className}`} aria-label="Groundwork home">
      <span aria-hidden className="inline-block h-[11px] w-[11px] translate-y-px rounded-[2px] bg-current" />
      <span className="text-[17px] font-bold tracking-[-0.02em] [font-stretch:116%]">Groundwork</span>
    </Link>
  );
}
