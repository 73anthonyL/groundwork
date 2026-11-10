import { requireAuth } from "@/server/auth";
import { AppShell } from "@/components/app-shell";
import { SUB_NAV } from "@/components/gc-nav";

export default async function SubLayout({ children }: { children: React.ReactNode }) {
  const session = await requireAuth("sub");
  return (
    <AppShell session={session} nav={SUB_NAV}>
      {children}
    </AppShell>
  );
}
