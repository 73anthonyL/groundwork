import { requireAuth } from "@/server/auth";
import { listProjects } from "@/server/scoped";
import { AppShell } from "@/components/app-shell";
import { GC_NAV } from "@/components/gc-nav";

export default async function GcLayout({ children }: { children: React.ReactNode }) {
  const session = await requireAuth("gc");
  const projects = await listProjects(session.org);
  return (
    <AppShell session={session} nav={GC_NAV} projects={projects.map((p) => ({ id: p.id, name: p.name, href: `/gc/projects/${p.id}` }))}>
      {children}
    </AppShell>
  );
}
