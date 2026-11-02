import Link from "next/link";
import { Wordmark } from "./wordmark";
import { signOut } from "@/app/sign-in/actions";
import type { Session } from "@/server/auth";
import { Button } from "@/components/ui/button";

const KIND_LABEL: Record<Session["org"]["kind"], string> = {
  gc: "General contractor",
  sub: "Subcontractor",
  owner: "Owner",
};

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
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-b border-border bg-card">
        <div
          className={`mx-auto flex h-14 items-center justify-between gap-6 px-4 sm:px-6 ${
            width === "wide" ? "max-w-7xl" : "max-w-xl"
          }`}
        >
          <div className="flex items-center gap-8">
            <Wordmark href={nav?.[0]?.href ?? "/"} />
            {nav && (
              <nav className={`items-center gap-5 text-sm text-muted-foreground ${width === "wide" ? "hidden sm:flex" : "hidden"}`} aria-label="Primary">
                {nav.map((n) => (
                  <Link key={n.href} href={n.href} className="hover:text-foreground">
                    {n.label}
                  </Link>
                ))}
              </nav>
            )}
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right leading-tight">
              <div className="text-sm font-medium">{session.user.name}</div>
              <div className="hidden text-xs text-muted-foreground sm:block">
                {session.org.name} · {KIND_LABEL[session.org.kind]}
              </div>
              <div className="text-xs text-muted-foreground sm:hidden">{session.org.name}</div>
            </div>
            <form action={signOut}>
              <Button type="submit" variant="outline" size="sm">
                Sign out
              </Button>
            </form>
          </div>
        </div>
      </header>
      <main className={`mx-auto w-full flex-1 px-4 py-6 sm:px-6 sm:py-8 ${width === "wide" ? "max-w-7xl" : "max-w-xl"}`}>
        {children}
      </main>
    </div>
  );
}
