import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FileUp } from "lucide-react";
import { isSampleWorkspace, requireAuth } from "@/server/auth";
import { getProject, listContracts } from "@/server/scoped";
import { projectSummary } from "@/server/read/project";
import { gcSubAccess } from "@/server/read/gc-lists";
import { formatCents } from "@/lib/money";
import { PageBody, PageHeader } from "@/components/page-header";
import { ProjectTabs } from "@/components/project-tabs";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableChevron, TableEmpty, TableFoot, TableHead, TableHeader, TableLink, TableRow } from "@/components/ui/table";
import { StatusPill } from "@/components/status-pill";

export const metadata: Metadata = { title: "Subcontracts" };

export default async function SubcontractsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { org } = await requireAuth("gc");
  const project = await getProject(org, id);
  if (!project) notFound();
  const sample = isSampleWorkspace(org);
  const [all, summary, access] = await Promise.all([listContracts(org, id), projectSummary(org, id), gcSubAccess(org)]);
  // The contractor's own subcontracts; a subcontractor's lower tier is shown on that subcontract.
  const contracts = all.filter((c) => c.parentContractId === null);
  const billed = (contractId: string) => summary?.contracts.find((c) => c.id === contractId);
  const total = contracts.reduce((s, c) => s + c.contractSumCents, 0);
  const totalBilled = contracts.reduce((s, c) => s + (billed(c.id)?.billedCents ?? 0), 0);
  const add = `/gc/projects/${id}/subcontracts/new`;
  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "Projects", href: "/gc/projects" }, { label: project.name, href: `/gc/projects/${id}` }, { label: "Subcontracts" }]}
        title={project.name}
        actions={
          <Link href={add} className={buttonVariants({ variant: "primary" })}>
            <FileUp aria-hidden />
            Add subcontract
          </Link>
        }
        tabs={<ProjectTabs projectId={id} />}
      />
      <PageBody>
        <Table className="min-w-[820px]">
          <TableHeader>
            <TableRow>
              <TableHead>Subcontractor</TableHead>
              <TableHead>Trade</TableHead>
              <TableHead numeric>Subcontract sum</TableHead>
              <TableHead>Payment rules</TableHead>
              <TableHead>Invite</TableHead>
              <TableHead numeric>Billed to date</TableHead>
              <TableHead>
                <span className="sr-only">Open</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {contracts.length === 0 && (
              <TableEmpty
                colSpan={7}
                action={
                  <Link href={add} className={buttonVariants({ variant: "secondary", size: "sm" })}>
                    Add subcontract
                  </Link>
                }
              >
                No subcontracts yet.
              </TableEmpty>
            )}
            {contracts.map((c) => {
              const b = billed(c.id);
              const a = access[c.subOrgId];
              return (
                <TableRow key={c.id}>
                  <TableCell>
                    <TableLink href={`/gc/contracts/${c.id}`} className="whitespace-nowrap">
                      {c.sub.name}
                    </TableLink>
                  </TableCell>
                  <TableCell muted>{c.trade}</TableCell>
                  <TableCell numeric>{formatCents(c.contractSumCents)}</TableCell>
                  <TableCell>
                    <StatusPill status={c.status} />
                  </TableCell>
                  <TableCell>
                    {sample ? (
                      <Badge>Sample company</Badge>
                    ) : a?.status === "joined" ? (
                      <Badge tone="settled">Joined</Badge>
                    ) : a?.status === "invited" ? (
                      <span className="flex flex-wrap items-center gap-x-2">
                        <Badge tone="hold">Invited</Badge>
                        <Link href="/gc/team" className="type-meta text-link underline-offset-4 hover:underline">
                          Copy link
                        </Link>
                      </span>
                    ) : (
                      <span className="flex flex-wrap items-center gap-x-2">
                        <Badge>{a?.status === "expired" ? "Invite expired" : "Not invited"}</Badge>
                        <Link href={`/gc/team?invite=${c.subOrgId}`} className="type-meta text-link underline-offset-4 hover:underline">
                          Invite
                        </Link>
                      </span>
                    )}
                  </TableCell>
                  <TableCell numeric>
                    {formatCents(b?.billedCents ?? 0)}
                    <span className="ml-2 inline-block w-12 text-left text-xs text-muted-foreground">{b?.percentBilled ?? 0}%</span>
                  </TableCell>
                  <TableChevron />
                </TableRow>
              );
            })}
          </TableBody>
          {contracts.length > 1 && (
            <TableFoot>
              <TableRow>
                <TableCell colSpan={2}>{contracts.length} subcontracts</TableCell>
                <TableCell numeric>{formatCents(total)}</TableCell>
                <TableCell colSpan={2} />
                <TableCell numeric>
                  {formatCents(totalBilled)}
                  <span className="ml-2 inline-block w-12 text-left text-xs font-normal text-muted-foreground">{total > 0 ? Math.round((totalBilled / total) * 1000) / 10 : 0}%</span>
                </TableCell>
                <TableCell />
              </TableRow>
            </TableFoot>
          )}
        </Table>
      </PageBody>
    </>
  );
}
