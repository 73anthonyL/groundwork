/**
 * AppShell: the frame every signed-in page sits in. A 256px sidebar on desktop; below `lg` a 48px
 * top bar whose menu button opens the same sidebar in a sheet.
 *
 *   <AppShell session={session} nav={GC_NAV} projects={[{ id, name, href: `/gc/projects/${id}` }]}>
 *     <PageHeader … />
 *     <PageBody>…</PageBody>
 *   </AppShell>
 *
 * Props: `session`; `nav` (NavItem[] from ./gc-nav: GC_NAV, SUB_NAV, OWNER_NAV; defaults to the
 * list for the company's kind); `projects?` (listed under a "Projects" group, current one
 * highlighted); `isSample?` (defaults to the organization's `isDemo`; shows one "Sample workspace"
 * badge); `children`.
 *
 * The shell pads the page (16px phone, 24px tablet, 32px desktop) and sets 14/20 text. Pages put
 * <PageHeader> and <PageBody> at the top level; those set the width. Anything else placed directly
 * in the shell is held to the default 1100px so older pages still line up.
 */
import Link from "next/link";
import { ArrowLeftRight, LogOut, RotateCcw } from "lucide-react";
import { signOut } from "@/app/sign-in/actions";
import type { Session } from "@/server/auth";
import { Badge } from "@/components/ui/badge";
import { NAV_BY_KIND, type NavItem, type NavProject } from "./gc-nav";
import { MobileNav, NavLink, navIcon, navRow } from "./nav-links";
import { Wordmark } from "./wordmark";
import { Tour, TourRestartButton } from "./tour/tour";

export type { NavItem, NavProject };

const KIND_LABEL: Record<Session["org"]["kind"], string> = {
  gc: "General contractor",
  sub: "Subcontractor",
  owner: "Owner",
};

/** How many projects the sidebar lists before it points to the full list. */
const PROJECT_LIMIT = 8;

export function AppShell({
  session,
  nav,
  projects,
  isSample,
  children,
}: {
  session: Session;
  nav?: NavItem[];
  projects?: NavProject[];
  isSample?: boolean;
  children: React.ReactNode;
}) {
  const items = nav ?? NAV_BY_KIND[session.org.kind];
  const main = items.filter((n) => n.section !== "bottom");
  const bottom = items.filter((n) => n.section === "bottom");
  const listed = projects?.slice(0, PROJECT_LIMIT) ?? [];
  const scope = [...items.map((n) => n.href), ...listed.map((p) => p.href)];
  const home = items[0]?.href ?? "/";
  const sample = isSample ?? session.org.isDemo;
  const projectsHref = items.find((n) => n.icon === "projects")?.href;

  const sidebar = (
    <>
      <div className="flex h-14 shrink-0 items-center px-4">
        <Wordmark href={home} />
      </div>
      <nav aria-label="Primary" className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-2 pb-4">
        <ul className="flex flex-col gap-px">
          {main.map((n) => (
            <li key={n.href}>
              <NavLink href={n.href} label={n.label} icon={n.icon} scope={scope} />
            </li>
          ))}
        </ul>
        {listed.length > 0 && (
          <div>
            <h2 className="type-caption px-2 pb-1 font-medium text-muted-foreground">Projects</h2>
            <ul className="flex flex-col gap-px">
              {listed.map((p) => (
                <li key={p.id}>
                  <NavLink href={p.href} label={p.name} scope={scope} />
                </li>
              ))}
              {projects && projects.length > listed.length && projectsHref && (
                <li>
                  <Link href={projectsHref} className={`${navRow} text-muted-foreground!`}>
                    All {projects.length} projects
                  </Link>
                </li>
              )}
            </ul>
          </div>
        )}
      </nav>
      <div className="shrink-0 px-2 pb-2">
        {sample && (
          <div className="flex items-center justify-between gap-2 px-2 pb-2">
            <Badge dot={false}>Sample workspace</Badge>
          </div>
        )}
        <ul className="flex flex-col gap-px">
          {bottom.map((n) => (
            <li key={n.href}>
              <NavLink href={n.href} label={n.label} icon={n.icon} scope={scope} />
            </li>
          ))}
          {sample && (
            <li>
              <Link href="/sample" className={navRow}>
                <ArrowLeftRight aria-hidden className={navIcon} />
                Switch role
              </Link>
            </li>
          )}
          {sample && (
            <li>
              <TourRestartButton home={home} className={navRow}>
                <RotateCcw aria-hidden className={navIcon} />
                Replay tour
              </TourRestartButton>
            </li>
          )}
          <li>
            <form action={signOut}>
              <button type="submit" className={navRow}>
                <LogOut aria-hidden className={navIcon} />
                Sign out
              </button>
            </form>
          </li>
        </ul>
      </div>
      <div className="shrink-0 border-t px-4 py-3">
        <div className="truncate text-[13px] leading-[18px] font-medium">{session.user.name}</div>
        <div className="type-caption truncate text-muted-foreground" title={`${session.org.name}, ${KIND_LABEL[session.org.kind].toLowerCase()}`}>
          {session.org.name}
        </div>
      </div>
    </>
  );

  return (
    <div data-slot="app-shell" className="flex min-h-dvh flex-1 flex-col text-sm leading-5 lg:flex-row">
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r bg-sidebar lg:flex">{sidebar}</aside>
      <header className="sticky top-0 z-30 flex h-12 shrink-0 items-center justify-between gap-4 border-b bg-sidebar px-4 lg:hidden">
        <div className="flex min-w-0 items-center gap-3">
          <Wordmark href={home} />
          <span className="type-caption truncate text-muted-foreground">{session.org.name}</span>
        </div>
        <MobileNav>{sidebar}</MobileNav>
      </header>
      <main className="min-w-0 flex-1 px-4 pt-6 pb-16 sm:px-6 lg:px-8 lg:pt-8 [&>*:not([data-page])]:mx-auto [&>*:not([data-page])]:w-full [&>*:not([data-page])]:max-w-[1100px]">
        {children}
      </main>
      {sample && <Tour kind={session.org.kind} name={session.user.name} />}
    </div>
  );
}
