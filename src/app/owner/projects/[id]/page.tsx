import { notFound } from "next/navigation";
import { Eye } from "lucide-react";
import { requireAuth } from "@/server/auth";
import { getProject } from "@/server/scoped";
import { formatCentsCompact } from "@/lib/money";
import { ProjectLive } from "@/components/project-live";
import { PageBody, PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";

/** One project, as its owner sees it: the live view of where their payments went. Read-only. */
export default async function OwnerProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { org } = await requireAuth("owner");
  const project = await getProject(org, id);
  if (!project) notFound();
  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "Your projects", href: "/owner" }, { label: project.name }]}
        title={project.name}
        badge={<Badge icon={<Eye aria-hidden />}>Read-only</Badge>}
        description={`Built by ${project.gc.name} under a ${formatCentsCompact(project.primeContractSumCents)} prime contract${project.address ? `, ${project.address}` : ""}. You can see where each of your payments went; nothing here needs your action.`}
      />
      <PageBody>
        <ProjectLive org={org} projectId={project.id} />
      </PageBody>
    </>
  );
}
