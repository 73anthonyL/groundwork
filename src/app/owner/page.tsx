import { requireAuth } from "@/server/auth";
import { listProjects } from "@/server/scoped";
import { AppShell } from "@/components/app-shell";
import { formatCentsCompact } from "@/lib/money";
import { ProjectLive } from "@/components/project-live";
import { PageHero } from "@/components/page-hero";

export default async function OwnerHome() {
  const session = await requireAuth("owner");
  const projects = await listProjects(session.org);
  return (
    <AppShell session={session}>
      <PageHero
        title="Where your money went"
        lede={`You are ${session.user.name} at ${session.org.name}, the owner paying for the building. You pay the general contractor. This page shows how far each payment has travelled: which subcontractors have been paid, what is on its way, and what is being held back. You only watch here; nothing needs your action.`}
      />
      <ul className="grid gap-4 sm:grid-cols-2">
        {projects.map((p) => (
          <li key={p.id} className="rounded-xl bg-card shadow-card p-5">
            <div className="font-medium">{p.name}</div>
            <div className="mt-1 text-sm text-muted-foreground">
              Built by {p.gc.name} · <span className="num">{formatCentsCompact(p.primeContractSumCents)}</span>
            </div>
          </li>
        ))}
      </ul>
      {projects.map((p) => (
        <section key={p.id} className="mt-10" aria-label={`${p.name} live view`}>
          <h2 className="text-xl font-semibold">{p.name}: where your money went</h2>
          <div className="mt-4">
            <ProjectLive org={session.org} projectId={p.id} />
          </div>
        </section>
      ))}
    </AppShell>
  );
}
