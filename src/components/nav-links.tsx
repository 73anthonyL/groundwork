"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Primary navigation. The current section is ink; the rest recede. */
export function NavLinks({ nav, className = "" }: { nav: { href: string; label: string }[]; className?: string }) {
  const path = usePathname();
  // The first link is the section's home, so it also owns every path no other link claims.
  const others = nav.slice(1).map((n) => n.href);
  const current = (href: string, i: number) => (i === 0 ? !others.some((o) => path === o || path.startsWith(`${o}/`)) : path === href || path.startsWith(`${href}/`));
  return (
    <nav className={`items-center gap-1 text-[13px] ${className}`} aria-label="Primary">
      {nav.map((n, i) => {
        const on = current(n.href, i);
        return (
          <Link key={n.href} href={n.href} aria-current={on ? "page" : undefined} className={`rounded-md px-2.5 py-1 transition-colors ${on ? "font-medium text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
            {n.label}
          </Link>
        );
      })}
    </nav>
  );
}
