import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { requireAuth } from "@/server/auth";
import { getProject } from "@/server/scoped";
import { AddSubcontractForm } from "@/components/add-subcontract-form";

export const metadata: Metadata = { title: "Add a subcontract" };

/** Step one of everything: put a signed subcontract in front of Groundwork. */
export default async function NewSubcontractPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { org } = await requireAuth("gc");
  const project = await getProject(org, id);
  if (!project) notFound();
  const db = await getDb();
  // Subcontractors already on this project can't be added twice; everyone else is offered by name.
  const onProject = new Set((await db.query.contracts.findMany({ where: eq(schema.contracts.projectId, id), columns: { subOrgId: true } })).map((c) => c.subOrgId));
  const knownSubs = (await db.query.organizations.findMany({ where: eq(schema.organizations.kind, "sub"), columns: { id: true, name: true } })).filter((o) => !onProject.has(o.id)).map((o) => o.name).sort();

  return (
    <div className="mx-auto max-w-xl">
      <Link href={`/gc/projects/${id}`} className="text-sm text-link hover:underline">
        Back to {project.name}
      </Link>
      <h1 className="mt-2 text-[2rem] font-semibold leading-tight">Add a subcontract</h1>
      <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">Upload the signed contract. Groundwork reads when and how this subcontractor gets paid, shows you each term next to the clause it came from, and waits for your approval.</p>
      <div className="mt-8">
        <AddSubcontractForm projectId={id} knownSubs={knownSubs} />
      </div>
    </div>
  );
}
