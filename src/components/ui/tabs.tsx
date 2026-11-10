"use client"

/**
 * Tabs: links, not buttons. The address decides which tab is current, so a tab can be opened in a
 * new window, shared and reloaded.
 *
 *   <Tabs label="Project sections" items={[
 *     { href: `/gc/projects/${id}`, label: "Overview" },
 *     { href: `/gc/projects/${id}/pay-apps`, label: "Pay apps", count: 3 },
 *   ]} />
 *
 * Props: `items` ({ href, label, count? }[]), `label` (names the nav for screen readers),
 * `current?` (an href, to override the address match), `className?`.
 * The current tab is the item whose href is the longest prefix of the path; it gets aria-current="page".
 */
import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "cn"

export type TabItem = { href: string; label: string; count?: number }

/** The href from `hrefs` that best matches `path`: exact, or the longest one that is a path prefix. */
export function matchHref(path: string, hrefs: string[]): string | undefined {
  let best: string | undefined
  for (const h of hrefs) {
    const clean = h.split(/[?#]/)[0]
    if (path === clean || path.startsWith(`${clean}/`)) if (!best || clean.length > best.split(/[?#]/)[0].length) best = h
  }
  return best
}

function Tabs({ items, label = "Sections", current, className }: { items: TabItem[]; label?: string; current?: string; className?: string }) {
  const path = usePathname()
  const active = current ?? matchHref(path, items.map((t) => t.href))
  return (
    <nav data-slot="tabs" aria-label={label} className={cn("flex gap-4 overflow-x-auto border-b [scrollbar-width:none]", className)}>
      {items.map((t) => {
        const on = t.href === active
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={on ? "page" : undefined}
            className={cn(
              "-mb-px flex h-9 shrink-0 items-center gap-1.5 border-b-2 text-sm leading-5 whitespace-nowrap -outline-offset-2",
              on ? "border-foreground font-medium text-foreground" : "border-transparent text-muted-foreground hover:border-input hover:text-foreground"
            )}
          >
            {t.label}
            {t.count !== undefined && <span className="num rounded-sm bg-secondary px-1 text-xs leading-4 font-medium text-muted-foreground">{t.count}</span>}
          </Link>
        )
      })}
    </nav>
  )
}

export { Tabs }
