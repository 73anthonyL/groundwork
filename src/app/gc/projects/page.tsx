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
