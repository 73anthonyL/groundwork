import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { requireAuth } from "@/server/auth";
import { getContract, getContractAdjustments } from "@/server/scoped";
import { ContractAdjustments } from "@/components/contract-adjustments";
import { getDb, schema } from "@/db/client";
import { formatCentsCompact } from "@/lib/money";
import type { StoredRules } from "@/server/rules/review";
import { StatusPill } from "@/components/status-pill";
import { CompileReview, type RuleSetView } from "@/components/compile-review";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { certifyRetentionAction, decideChangeOrderAction, proposeChangeOrderAction, recordBackchargeAction, uploadContractPdfAction, voidBackchargeAction } from "./actions";

export default async function ContractPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ msg?: string }> }) {
  const { id } = await params;
  const { msg } = await searchParams;
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
        stored: latest.rules as StoredRules,
      }
    : null;

  return (
    <div>
      <Link href={`/gc/projects/${contract.projectId}`} className="text-sm text-muted-foreground hover:text-link">
        {contract.project.name}
      </Link>
      <div className="mt-1 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[2rem] font-semibold leading-tight">{contract.sub.name}</h1>
          <p className="num mt-1 text-sm text-muted-foreground">
            {contract.trade}, {formatCentsCompact(contract.contractSumCents)} subcontract
          </p>
        </div>
        <StatusPill status={contract.status} />
      </div>
      {contract.status !== "active" && (
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">{contract.documentId ? "Use a different subcontract PDF" : "Upload the subcontract PDF"}</summary>
          <form action={uploadContractPdfAction} className="mt-3 flex flex-wrap items-center gap-3">
            <input type="hidden" name="contractId" value={contract.id} />
            <input id="contract-pdf" name="file" type="file" accept="application/pdf" required aria-label="Subcontract PDF" className="max-w-72 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-sm file:font-medium" />
            <Button type="submit" size="sm" variant="outline">
              Upload
            </Button>
            <span className="text-xs text-muted-foreground">A text PDF up to 4 MB. Reading it needs the Claude API.</span>
          </form>
        </details>
      )}
      {msg && (
        <p role="status" className="mt-3 rounded-xl bg-card shadow-card px-3 py-2 text-sm">
          {decodeURIComponent(msg)}
        </p>
      )}

      <div className="mt-6">
        <CompileReview contractId={contract.id} documentUrl={contract.documentId ? `/api/documents/${contract.documentId}` : null} subName={contract.sub.name} ruleSet={view} canCompile={Boolean(contract.documentId)} />
      </div>

      {adjustments && (
        <div className="mt-10">
          <ContractAdjustments
            data={adjustments}
            role="payer"
            actions={{ proposeChangeOrder: proposeChangeOrderAction, decideChangeOrder: decideChangeOrderAction, recordBackcharge: recordBackchargeAction, voidBackcharge: voidBackchargeAction, certifyRetention: certifyRetentionAction }}
          />
        </div>
      )}

      <section className="mt-10" aria-labelledby="sov-heading">
        <h2 id="sov-heading" className="text-lg font-semibold">
          Schedule of values
        </h2>
        <div className="mt-3 max-w-xl overflow-hidden rounded-xl bg-card shadow-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">#</TableHead>
                <TableHead>Item</TableHead>
                <TableHead className="text-right">Value</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {contract.sovLines.map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="num text-muted-foreground">{l.lineNo}</TableCell>
                  <TableCell>{l.description}</TableCell>
                  <TableCell className="num text-right">{formatCentsCompact(l.scheduledValueCents)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>
    </div>
  );
}
