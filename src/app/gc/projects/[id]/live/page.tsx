import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAuth } from "@/server/auth";
import { getProject } from "@/server/scoped";
import { PageBody, PageHeader } from "@/components/page-header";
import { ProjectTabs } from "@/components/project-tabs";
import { ProjectLive } from "@/components/project-live";
import { buttonVariants } from "@/components/ui/button";
import { Section } from "@/components/ui/panel";

export const metadata = { title: "Charts" };

/** The overview's figures as charts. Reached from the money flow on the overview. */
export default async function ProjectLivePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { org } = await requireAuth("gc");
  const project = await getProject(org, id);
  if (!project) notFound();
  return (
    <>
      <PageHeader breadcrumbs={[{ label: "Projects", href: "/gc/projects" }, { label: project.name, href: `/gc/projects/${id}` }, { label: "Charts" }]} title={project.name} tabs={<ProjectTabs projectId={id} />} />
      <PageBody>
        <Section
          title="Charts"
          actions={
            <Link href={`/gc/projects/${id}`} className={buttonVariants({ variant: "secondary", size: "sm" })}>
              Back to overview
            </Link>
          }
        >
          <ProjectLive org={org} projectId={id} />
        </Section>
      </PageBody>
    </>
  );
}
