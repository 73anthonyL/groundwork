import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAuth } from "@/server/auth";
import { getProject } from "@/server/scoped";
import { ProjectLive } from "@/components/project-live";
import { ProjectTabs } from "@/components/project-tabs";

export const metadata = { title: "Live view" };

export default async function ProjectLivePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { org } = await requireAuth("gc");
  const project = await getProject(org, id);
  if (!project) notFound();
  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
        <div className="min-w-0">
          <h1 className="text-[2rem] font-semibold leading-tight">{project.name}</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">The same project as the board, drawn instead of listed.</p>
        </div>
        <ProjectTabs projectId={id} active="live" />
      </div>
      <div className="mt-8">
        <ProjectLive org={org} projectId={id} />
      </div>
      <p className="mt-6 text-xs text-muted-foreground">
        Every picture on this page is drawn from <Link href={`/api/v1/projects/${id}`} className="underline underline-offset-2">/api/v1/projects/{id.slice(0, 8)}…</Link>.
      </p>
    </div>
  );
}
