import { requireAuth } from "@/server/auth";
import { listProjects } from "@/server/scoped";
import { AppShell } from "@/components/app-shell";
import { formatCentsCompact } from "@/lib/money";

export default async function OwnerHome() {
  const session = await requireAuth("owner");
  const projects = await listProjects(session.org);
  return (
    <AppShell session={session}>
      <h1 className="text-3xl font-semibold">Projects you fund</h1>
      <ul className="mt-6 grid gap-4 sm:grid-cols-2">
        {projects.map((p) => (
          <li key={p.id} className="rounded-md border bg-card p-5">
            <div className="font-medium">{p.name}</div>
            <div className="mt-1 text-sm text-muted-foreground">
              Built by {p.gc.name} · <span className="num">{formatCentsCompact(p.primeContractSumCents)}</span>
            </div>
          </li>
        ))}
      </ul>
    </AppShell>
  );
}
