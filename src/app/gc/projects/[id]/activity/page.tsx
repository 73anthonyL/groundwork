import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAuth } from "@/server/auth";
import { getProject } from "@/server/scoped";
import { projectTimeline, type TimelineEntry } from "@/server/read/project";
import { formatCents } from "@/lib/money";
import { PageBody, PageHeader } from "@/components/page-header";
import { ProjectTabs } from "@/components/project-tabs";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const metadata: Metadata = { title: "Activity" };

/** What the event is about. A plain tag: color is kept for states, and these are not states. */
const AREA: Record<TimelineEntry["lane"], string> = { contract: "Subcontract", billing: "Pay app", money: "Payment", waiver: "Waiver", adjustment: "Adjustment" };

/** The product's words for the events whose recorded titles use older ones. */
const TITLE: Record<string, string> = {
  "pay_app.submitted": "Pay app submitted",
  "pay_app.approved": "Pay app approved",
  "release.planned": "Payment planned",
  "release.settled": "Payment received and confirmed",
  "rules.approved": "Payment rules approved",
  "rules.extracted": "Subcontract read into payment rules",
  "rules.field_accepted": "Flagged term accepted",
  "rules.field_overridden": "Term corrected",
  "rules.anomaly_acknowledged": "Note acknowledged",
};

const when = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });

/** Who did what and when on this project, newest first, from the events the app records as things happen. */
export default async function ActivityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { org } = await requireAuth("gc");
  const project = await getProject(org, id);
  if (!project) notFound();
  const LIMIT = 500;
  const entries = [...((await projectTimeline(org, id, LIMIT)) ?? [])].reverse();
  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "Projects", href: "/gc/projects" }, { label: project.name, href: `/gc/projects/${id}` }, { label: "Activity" }]}
        title={project.name}
        tabs={<ProjectTabs projectId={id} />}
      />
      <PageBody>
        <Table className="min-w-[820px]">
          <TableHeader>
            <TableRow>
              <TableHead>When</TableHead>
              <TableHead>Who</TableHead>
              <TableHead>What</TableHead>
              <TableHead>Subcontractor</TableHead>
              <TableHead numeric>Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.length === 0 && <TableEmpty colSpan={5}>No activity yet. Each upload, approval, pay app, waiver and payment is recorded here as it happens.</TableEmpty>}
            {entries.map((e) => (
              <TableRow key={e.id}>
                <TableCell muted className="type-mono whitespace-nowrap text-xs">
                  <time dateTime={e.at}>{when.format(new Date(e.at))}</time>
                </TableCell>
                <TableCell className="whitespace-nowrap">{e.actor}</TableCell>
                <TableCell>
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <Badge dot={false} className="w-[76px] justify-center">
                      {AREA[e.lane]}
                    </Badge>
                    <span>{TITLE[e.type] ?? e.title}</span>
                    {e.detail && <span className="type-meta text-muted-foreground">{e.detail}</span>}
                  </span>
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  {e.party && e.contractId ? (
                    <Link href={`/gc/contracts/${e.contractId}`} className="rounded-sm underline-offset-4 hover:underline">
                      {e.party}
                    </Link>
                  ) : (
                    (e.party ?? "")
                  )}
                </TableCell>
                <TableCell numeric>{e.amountCents === null ? "" : formatCents(e.amountCents)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {entries.length >= LIMIT && <p className="type-meta text-muted-foreground">Showing the most recent {LIMIT} events.</p>}
      </PageBody>
    </>
  );
}
