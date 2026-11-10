import { Eye } from "lucide-react";
import { requireAuth } from "@/server/auth";
import { listProjects } from "@/server/scoped";
import { projectSummary } from "@/server/read/project";
import { formatCents, formatCentsCompact } from "@/lib/money";
import { ProjectLive } from "@/components/project-live";
import { PageBody, PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Section } from "@/components/ui/panel";
import { Table, TableBody, TableCell, TableChevron, TableFoot, TableHead, TableHeader, TableLink, TableRow } from "@/components/ui/table";

export const metadata = { title: "Your projects" };

/** The owner's read-only home: each project they pay for, and how far their money has travelled down the chain. */
export default async function OwnerHome() {
  const { org } = await requireAuth("owner");
  const projects = await listProjects(org);
  const rows = (await Promise.all(projects.map(async (p) => ({ p, s: await projectSummary(org, p.id) })))).map(({ p, s }) => ({
    p,
    paid: s?.totals.paidCents ?? 0,
    moving: s?.totals.inMotionCents ?? 0,
    held: s?.totals.retainageHeldCents ?? 0,
  }));
  const sum = (k: "paid" | "moving" | "held") => rows.reduce((x, r) => x + r[k], 0);
  const only = projects.length === 1 ? projects[0] : null;

  return (
    <>
      <PageHeader
        title="Your projects"
        badge={
          <Badge icon={<Eye aria-hidden />}>Read-only</Badge>
        }
        description={`${org.name} pays the general contractor. This view shows where that money has gone: what each subcontractor has been paid, what is on its way and what is held as retainage. It is read-only; nothing here needs your action.`}
      />
      <PageBody>
        {projects.length === 0 ? (
          <EmptyState title="No projects yet" description="A project appears here when your general contractor creates it on Groundwork and names your company as the owner." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Project</TableHead>
                <TableHead className="max-md:hidden">Contractor</TableHead>
                <TableHead numeric className="max-lg:hidden">
                  Prime contract
                </TableHead>
                <TableHead numeric>Paid to subcontractors</TableHead>
                <TableHead numeric className="max-sm:hidden">
                  On its way
                </TableHead>
                <TableHead numeric className="max-sm:hidden">
                  Retainage held
                </TableHead>
                <th className="w-8 max-sm:hidden">
                  <span className="sr-only">Open</span>
                </th>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(({ p, paid, moving, held }) => (
                <TableRow key={p.id}>
                  <TableCell>
                    <TableLink href={`/owner/projects/${p.id}`}>{p.name}</TableLink>
                    <div className="type-meta text-muted-foreground md:hidden">{p.gc.name}</div>
                    <div className="type-meta num text-muted-foreground lg:hidden">{formatCentsCompact(p.primeContractSumCents)} prime contract</div>
                    <div className="type-meta num text-muted-foreground sm:hidden">
                      {formatCents(moving)} on its way, {formatCents(held)} held
                    </div>
                  </TableCell>
                  <TableCell muted className="max-md:hidden">
                    {p.gc.name}
                  </TableCell>
                  <TableCell numeric className="max-lg:hidden">
                    {formatCents(p.primeContractSumCents)}
                  </TableCell>
                  <TableCell numeric className="max-sm:align-top">
                    {formatCents(paid)}
                  </TableCell>
                  <TableCell numeric className={`max-sm:hidden ${moving > 0 ? "text-money" : ""}`}>
                    {formatCents(moving)}
                  </TableCell>
                  <TableCell numeric className="max-sm:hidden">
                    {formatCents(held)}
                  </TableCell>
                  <TableChevron className="max-sm:hidden" />
                </TableRow>
              ))}
            </TableBody>
            {rows.length > 1 && (
              <TableFoot>
                <TableRow>
                  <TableCell>Total</TableCell>
                  <TableCell className="max-md:hidden" />
                  <TableCell numeric className="max-lg:hidden">
                    {formatCents(projects.reduce((x, p) => x + p.primeContractSumCents, 0))}
                  </TableCell>
                  <TableCell numeric>{formatCents(sum("paid"))}</TableCell>
                  <TableCell numeric className="max-sm:hidden">
                    {formatCents(sum("moving"))}
                  </TableCell>
                  <TableCell numeric className="max-sm:hidden">
                    {formatCents(sum("held"))}
                  </TableCell>
                  <td className="max-sm:hidden" />
                </TableRow>
              </TableFoot>
            )}
          </Table>
        )}

        {only && (
          <Section title={only.name} description={`How each of your payments to ${only.gc.name} was split and where it stands now.`}>
            <ProjectLive org={org} projectId={only.id} />
          </Section>
        )}
      </PageBody>
    </>
  );
}
