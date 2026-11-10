import { requireAuth } from "@/server/auth";
import { AppShell } from "@/components/app-shell";
import { GC_NAV } from "@/components/gc-nav";

export default async function GcLayout({ children }: { children: React.ReactNode }) {
  const session = await requireAuth("gc");
  return (
    <AppShell
      session={session}
      nav={GC_NAV}
    >
      {children}
    </AppShell>
  );
}
