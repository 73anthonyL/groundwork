import { Wordmark } from "./wordmark";
import { NavLinks } from "./nav-links";
import { signOut } from "@/app/sign-in/actions";
import type { Session } from "@/server/auth";

const KIND_LABEL: Record<Session["org"]["kind"], string> = {
  gc: "General contractor",
  sub: "Subcontractor",
  owner: "Owner",
};

/**
 * The frame every signed-in page sits in: a thin bar that stays put and stays quiet, so the page's
 * own content is the first thing read. The bar is the only translucent surface in the app.
 */
export function AppShell({
  session,
  nav,
  children,
  width = "wide",
}: {
  session: Session;
  nav?: { href: string; label: string }[];
  children: React.ReactNode;
  width?: "wide" | "narrow";
}) {
  const inner = width === "wide" ? "max-w-6xl" : "max-w-xl";
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur-xl backdrop-saturate-150">
        <div className={`mx-auto flex h-12 items-center justify-between gap-6 px-4 sm:px-6 ${inner}`}>
          <div className="flex min-w-0 items-center gap-7">
            <Wordmark href={nav?.[0]?.href ?? "/"} />
            {nav && nav.length > 1 && <NavLinks nav={nav} className={width === "wide" ? "hidden sm:flex" : "hidden"} />}
          </div>
          <div className="flex shrink-0 items-center gap-3 text-[13px]">
            <span className="hidden text-muted-foreground md:inline">
              {session.org.name}, {KIND_LABEL[session.org.kind].toLowerCase()}
            </span>
            <span className="font-medium">{session.user.name}</span>
            <form action={signOut}>
              <button type="submit" className="rounded-md px-2 py-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className={`mx-auto w-full flex-1 px-4 py-8 sm:px-6 sm:py-10 ${inner}`}>{children}</main>
    </div>
  );
}
