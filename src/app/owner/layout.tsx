import { requireAuth } from "@/server/auth";
import { AppShell } from "@/components/app-shell";
import { OWNER_NAV } from "@/components/gc-nav";

export default async function OwnerLayout({ children }: { children: React.ReactNode }) {
  const session = await requireAuth("owner");
  return (
    <AppShell session={session} nav={OWNER_NAV}>
      {children}
    </AppShell>
  );
}
