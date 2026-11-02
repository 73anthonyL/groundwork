import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAuth } from "@/server/auth";
import { listProjects } from "@/server/scoped";
import { formatCentsCompact } from "@/lib/money";

export default async function GcHome() {
  const { org } = await requireAuth("gc");
  const projects = await listProjects(org);
  if (projects.length === 1) redirect(`/gc/projects/${projects[0].id}`);
  return (
    <div>
      <h1 className="text-3xl font-semibold">Projects</h1>
      {projects.length === 0 ? (
        <p className="mt-4 text-muted-foreground">No projects yet. Run the demo reset to seed Bayview Clinic TI.</p>
      ) : (
        <ul className="mt-6 grid gap-4 sm:grid-cols-2">
          {projects.map((p) => (
            <li key={p.id} className="rounded-md border bg-card p-5">
              <Link href={`/gc/projects/${p.id}`} className="font-medium hover:underline">
                {p.name}
              </Link>
              <div className="mt-1 text-sm text-muted-foreground">
                {p.owner.name} · <span className="num">{formatCentsCompact(p.primeContractSumCents)}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
