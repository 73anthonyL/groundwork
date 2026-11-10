import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAuth } from "@/server/auth";
import { getProject } from "@/server/scoped";
import { ProjectLive } from "@/components/project-live";
import { ProjectTabs } from "@/components/project-tabs";
import { PageHero } from "@/components/page-hero";

export const metadata = { title: "Live view" };

export default async function ProjectLivePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { org } = await requireAuth("gc");
  const project = await getProject(org, id);
  if (!project) notFound();
  return (
    <div>
      <PageHero
        kicker={
          <Link href="/gc" className="text-stage-muted underline decoration-white/30 underline-offset-4 hover:text-white">
            All projects
          </Link>
        }
        title={project.name}
        lede="The same project as the board, drawn instead of listed."
        aside={<ProjectTabs projectId={id} active="live" />}
      />
      <div>
        <ProjectLive org={org} projectId={id} />
      </div>
      <p className="mt-6 text-xs text-muted-foreground">
        Every picture on this page is drawn from <Link href={`/api/v1/projects/${id}`} className="underline underline-offset-2">/api/v1/projects/{id.slice(0, 8)}…</Link>.
      </p>
    </div>
  );
}
