import type { Metadata } from "next";
import Link from "next/link";
import { requireAuth } from "@/server/auth";
import { PageBody, PageHeader } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button";
import { ProjectsTable } from "./_components/projects-table";

export const metadata: Metadata = { title: "Projects" };

export default async function ProjectsPage() {
  const { org } = await requireAuth("gc");
  return (
    <>
      <PageHeader
        title="Projects"
        description="Each project runs under the payment law of its state. Open one to add subcontracts, review pay apps and record owner payments."
        actions={
          <Link href="/gc/projects/new" className={buttonVariants({ variant: "primary" })}>
            Create project
          </Link>
        }
      />
      <PageBody>
        <ProjectsTable org={org} createAction={false} />
      </PageBody>
    </>
  );
}
