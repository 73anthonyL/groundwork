import { notFound } from "next/navigation";
import { requireAuth } from "@/server/auth";
import { getProject } from "@/server/scoped";
import { listPayApps } from "@/server/read/gc-money";
import { PageBody, PageHeader } from "@/components/page-header";
import { ProjectTabs } from "@/components/project-tabs";
import { FilterLinks } from "@/app/gc/payments/payments-table";
import { PAY_APP_FILTERS, PayAppsTable, payAppFilter, type PayAppFilter } from "@/app/gc/pay-apps/pay-apps-table";

/** One project's pay apps, under the project's tabs. */
export const metadata = { title: "Pay apps" };

export default async function ProjectPayAppsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ status?: string }> }) {
  const { id } = await params;
  const { status } = await searchParams;
  const { org } = await requireAuth("gc");
  const project = await getProject(org, id);
  if (!project) notFound();
  const all = await listPayApps(org, id);
  const filter = payAppFilter(all, status);
  const href = (f: PayAppFilter) => `/gc/projects/${id}/pay-apps?status=${f}`;
  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "Projects", href: "/gc/projects" }, { label: project.name, href: `/gc/projects/${id}` }, { label: "Pay apps" }]}
        title={project.name}
        tabs={<ProjectTabs projectId={id} />}
      />
      <PageBody className="gap-3">
        <FilterLinks label="Pay apps by status" current={href(filter)} items={(Object.keys(PAY_APP_FILTERS) as PayAppFilter[]).map((f) => ({ href: href(f), label: PAY_APP_FILTERS[f].label, count: all.filter(PAY_APP_FILTERS[f].match).length }))} />
        <PayAppsTable rows={all.filter(PAY_APP_FILTERS[filter].match)} empty={PAY_APP_FILTERS[filter].empty} />
      </PageBody>
    </>
  );
}
