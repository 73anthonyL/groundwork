"use client";

/**
 * The client half of the app shell.
 *   NavLink   one sidebar row. `scope` is every href in the sidebar; the row is current when its
 *             href is the longest one that prefixes the address (so a project row beats "Projects").
 *   MobileNav the menu button in the phone top bar; opens the same sidebar in a sheet and closes
 *             when a link in it is followed.
 * Pages do not use these directly; they come with <AppShell>.
 */
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Banknote, Building2, FileText, FolderClosed, House, Menu, Settings, Users, type LucideIcon } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { matchHref } from "@/components/ui/tabs";
import type { NavIcon } from "./gc-nav";

const ICONS: Record<NavIcon, LucideIcon> = {
  home: House,
  projects: FolderClosed,
  "pay-apps": FileText,
  payments: Banknote,
  team: Users,
  company: Building2,
  settings: Settings,
};

/** Shared by links and the Sign out button so every sidebar row is the same size and answers hover the same way. */
export const navRow =
  "group flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-sm leading-5 text-foreground/80 -outline-offset-2 hover:bg-sidebar-accent hover:text-foreground aria-[current=page]:bg-sidebar-accent aria-[current=page]:font-medium aria-[current=page]:text-foreground";
export const navIcon = "size-4 shrink-0 text-muted-foreground group-hover:text-foreground group-aria-[current=page]:text-foreground";

export function NavLink({ href, label, icon, scope }: { href: string; label: string; icon?: NavIcon; scope: string[] }) {
  const path = usePathname();
  const on = matchHref(path, scope) === href;
  const Icon = icon ? ICONS[icon] : null;
  return (
    <Link href={href} aria-current={on ? "page" : undefined} className={navRow}>
      {Icon && <Icon aria-hidden className={navIcon} />}
      <span className="truncate">{label}</span>
    </Link>
  );
}

export function MobileNav({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger aria-label="Open menu" className="-mr-1.5 flex size-9 items-center justify-center rounded-md text-foreground hover:bg-sidebar-accent">
        <Menu aria-hidden className="size-5" />
      </SheetTrigger>
      <SheetContent side="left" className="w-72! max-w-[85vw] gap-0 bg-sidebar p-0 text-sm">
        <SheetTitle className="sr-only">Menu</SheetTitle>
        <SheetDescription className="sr-only">Navigation, your company and sign out.</SheetDescription>
        {/* Following a link closes the sheet; the page behind it has already changed. */}
        <div
          className="flex min-h-0 flex-1 flex-col"
          onClick={(e) => {
            if ((e.target as HTMLElement).closest("a")) setOpen(false);
          }}
        >
          {children}
        </div>
      </SheetContent>
    </Sheet>
  );
}
