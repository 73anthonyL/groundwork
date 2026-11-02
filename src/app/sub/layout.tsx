import { requireAuth } from "@/server/auth";
import { AppShell } from "@/components/app-shell";

export default async function SubLayout({ children }: { children: React.ReactNode }) {
  const session = await requireAuth("sub");
  return (
    <AppShell session={session} width="narrow" nav={[{ href: "/sub", label: "Where's my money" }]}>
      {children}
    </AppShell>
  );
}
