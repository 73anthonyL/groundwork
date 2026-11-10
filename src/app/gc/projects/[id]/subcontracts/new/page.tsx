import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isSampleWorkspace, requireAuth } from "@/server/auth";
import { getProject, listContracts } from "@/server/scoped";
import { gcSubcontractors } from "@/server/read/gc-lists";
import { PageBody, PageHeader } from "@/components/page-header";
import { AddSubcontractForm } from "@/components/add-subcontract-form";

export const metadata: Metadata = { title: "Add subcontract" };

/** Put a signed subcontract in front of Groundwork, and say who bills for the subcontractor. */
export default async function NewSubcontractPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { org } = await requireAuth("gc");
  const project = await getProject(org, id);
  if (!project) notFound();
  // Subcontractors this contractor already works with are offered by name, except those already on this project.
  const onProject = new Set((await listContracts(org, id)).map((c) => c.subOrgId));
  const knownSubs = (await gcSubcontractors(org)).filter((s) => !onProject.has(s.id)).map((s) => s.name);
  const base = `/gc/projects/${id}`;
  return (
    <>
      <PageHeader
        width="form"
        breadcrumbs={[{ label: "Projects", href: "/gc/projects" }, { label: project.name, href: base }, { label: "Subcontracts", href: `${base}/subcontracts` }, { label: "Add subcontract" }]}
        title="Add subcontract"
        description="Upload the signed contract. Groundwork reads when and how this subcontractor is paid, shows each term beside the clause it came from, and waits for your approval."
      />
      <PageBody width="form">
        <div className="rounded-lg border bg-card p-5">
          <AddSubcontractForm projectId={id} knownSubs={knownSubs} isSample={isSampleWorkspace(org)} cancelHref={`${base}/subcontracts`} />
        </div>
      </PageBody>
    </>
  );
}
