import { requireAuth } from "@/server/auth";
import { AppShell } from "@/components/app-shell";

export default async function GcLayout({ children }: { children: React.ReactNode }) {
  const session = await requireAuth("gc");
  return (
    <AppShell
      session={session}
      nav={[
        { href: "/gc", label: "Projects" },
        { href: "/gc/ledger", label: "Ledger" },
        { href: "/statutes", label: "Statutes" },
        { href: "/lab", label: "Lab" },
        { href: "/demo", label: "Demo" },
      ]}
    >
      {children}
    </AppShell>
  );
}
