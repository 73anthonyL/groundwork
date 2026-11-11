import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { requireAuth } from "@/server/auth";
import { getContract, getContractAdjustments } from "@/server/scoped";
import { ContractAdjustments } from "@/components/contract-adjustments";
import { getDb, schema } from "@/db/client";
import { formatCents } from "@/lib/money";
import type { StoredRules } from "@/server/rules/review";
import { StatusPill } from "@/components/status-pill";
import { CompileReview, SubmitButton, type RuleSetView } from "@/components/compile-review";
import { PageBody, PageHeader } from "@/components/page-header";
import { Section } from "@/components/ui/panel";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableFoot, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { certifyRetentionAction, decideChangeOrderAction, proposeChangeOrderAction, recordBackchargeAction, uploadContractPdfAction, voidBackchargeAction } from "./actions";

const when = (d: Date) => d.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });

export default async function ContractPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ msg?: string; read?: string; page?: string }> }) {
  const { id } = await params;
  const { msg, read, page } = await searchParams;
  const { org } = await requireAuth("gc");
  const contract = await getContract(org, id);
  if (!contract) notFound();
  const adjustments = contract.status === "active" ? await getContractAdjustments(org, id) : null;
  const latest = contract.ruleSets[0] ?? null;
  let approvedByName: string | null = null;
  if (latest?.approvedBy) {
    const db = await getDb();
    approvedByName = (await db.query.users.findFirst({ where: eq(schema.users.id, latest.approvedBy) }))?.name ?? null;
  }
  const view: RuleSetView | null = latest
    ? {
        id: latest.id,
        version: latest.version,
        status: latest.status,
        model: latest.model,
        extractionMs: latest.extractionMs,
        approvedHash: latest.approvedHash,
        approvedByName,
        approvedAt: latest.approvedAt?.toISOString() ?? null,
        approvedAtText: latest.approvedAt ? when(latest.approvedAt) : null,
        stored: latest.rules as StoredRules,
      }
    : null;
  const startPage = Number(page);
  const sovTotal = contract.sovLines.reduce((s, l) => s + l.scheduledValueCents, 0);

  const upload = (label: string) => (
    <form action={uploadContractPdfAction} className="flex flex-col gap-1.5">
      <input type="hidden" name="contractId" value={contract.id} />
      <div className="flex flex-wrap items-end gap-3">
        <Field label={label} className="w-full max-w-sm">
          <Input name="file" type="file" accept="application/pdf" required />
        </Field>
        <SubmitButton variant="secondary" className="h-9">
          Upload
        </SubmitButton>
      </div>
      <p className="type-meta text-muted-foreground">A text PDF up to 4 MB. Scanned pages cannot be read.</p>
    </form>
  );

  return (
    <>
      <PageHeader
        width="full"
        breadcrumbs={[
          { label: "Projects", href: "/gc/projects" },
          { label: contract.project.name, href: `/gc/projects/${contract.projectId}` },
          { label: "Subcontracts", href: `/gc/projects/${contract.projectId}/subcontracts` },
          { label: contract.sub.name },
        ]}
        title={contract.sub.name}
        badge={<StatusPill status={contract.status} />}
        description={
          <>
            {contract.trade}, <span className="num">{formatCents(contract.contractSumCents)}</span> subcontract. Groundwork reads its payment terms, checks each quote against the PDF, and you approve the rules once.
          </>
        }
      />
      <PageBody width="full">
        {msg && (
          <p role="status" className="border-y px-4 py-3">
            {decodeURIComponent(msg)}
          </p>
        )}

        <CompileReview
          contractId={contract.id}
          documentUrl={contract.documentId ? `/api/documents/${contract.documentId}` : null}
          subName={contract.sub.name}
          ruleSet={view}
          canCompile={Boolean(contract.documentId)}
          autoCompile={read === "1"}
          initialPage={Number.isInteger(startPage) && startPage > 0 ? startPage : 1}
          upload={<div className="rounded-lg border border-dashed border-input p-6">{upload("Subcontract PDF")}</div>}
        />

        <div className="flex w-full max-w-[1100px] flex-col gap-8">
          {adjustments && (
            <ContractAdjustments
              data={adjustments}
              role="payer"
              actions={{ proposeChangeOrder: proposeChangeOrderAction, decideChangeOrder: decideChangeOrderAction, recordBackcharge: recordBackchargeAction, voidBackcharge: voidBackchargeAction, certifyRetention: certifyRetentionAction }}
            />
          )}

          <Section title="Schedule of values" description="The lines the subcontractor bills against on each pay app.">
            <Table density="compact">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">#</TableHead>
                  <TableHead>Line</TableHead>
                  <TableHead numeric>Scheduled value</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {contract.sovLines.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="type-mono text-muted-foreground">{l.lineNo}</TableCell>
                    <TableCell>{l.description}</TableCell>
                    <TableCell numeric>{formatCents(l.scheduledValueCents)}</TableCell>
                  </TableRow>
                ))}
                {contract.sovLines.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="text-muted-foreground">
                      No schedule of values yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
              {contract.sovLines.length > 0 && (
                <TableFoot>
                  <TableRow>
                    <TableCell colSpan={2}>Subcontract sum</TableCell>
                    <TableCell numeric>{formatCents(sovTotal)}</TableCell>
                  </TableRow>
                </TableFoot>
              )}
            </Table>
          </Section>

          {contract.status !== "active" && contract.documentId && (
            <Section title="Use a different PDF" description="Upload another file to replace the PDF above. It is read again from the start.">
              {upload("Replacement PDF")}
            </Section>
          )}
        </div>
      </PageBody>
    </>
  );
}
