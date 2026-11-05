import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { requireAuth } from "@/server/auth";
import { getContract } from "@/server/scoped";
import { getDb, schema } from "@/db/client";
import { formatCentsCompact } from "@/lib/money";
import type { StoredRules } from "@/server/rules/review";
import { StatusPill } from "@/components/status-pill";
import { CompileReview, type RuleSetView } from "@/components/compile-review";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { uploadContractPdfAction } from "./actions";

export default async function ContractPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ msg?: string }> }) {
  const { id } = await params;
  const { msg } = await searchParams;
  const { org } = await requireAuth("gc");
  const contract = await getContract(org, id);
  if (!contract) notFound();
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
      <div className="text-sm text-muted-foreground">
        <Link href={`/gc/projects/${contract.projectId}`} className="hover:underline">
          {contract.project.name}
        </Link>{" "}
        / {contract.trade}
      </div>
      <div className="mt-1 flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-3xl font-semibold">{contract.sub.name}</h1>
        <div className="flex items-center gap-4 text-sm">
          <span className="num font-medium">{formatCentsCompact(contract.contractSumCents)}</span>
          <StatusPill status={contract.status} />
        </div>
      </div>
      {contract.status !== "active" && (
        <form action={uploadContractPdfAction} className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <input type="hidden" name="contractId" value={contract.id} />
          <label htmlFor="contract-pdf" className="text-muted-foreground">
            {contract.documentId ? "Try a different subcontract:" : "Upload the subcontract:"}
          </label>
          <input id="contract-pdf" name="file" type="file" accept="application/pdf" required className="max-w-64 text-sm file:mr-2 file:rounded file:border file:bg-card file:px-2 file:py-1" />
          <Button type="submit" size="sm" variant="outline">
            Upload PDF
          </Button>
          <span className="text-xs text-muted-foreground">Text PDF, up to 4 MB. Compiling it needs the Claude API.</span>
        </form>
      )}
      {msg && (
        <p role="status" className="mt-3 rounded-md border bg-card px-3 py-2 text-sm">
          {decodeURIComponent(msg)}
        </p>
      )}

      <div className="mt-6">
        <CompileReview contractId={contract.id} documentUrl={contract.documentId ? `/api/documents/${contract.documentId}` : null} subName={contract.sub.name} ruleSet={view} canCompile={Boolean(contract.documentId)} />
      </div>

      <section className="mt-10" aria-labelledby="sov-heading">
        <h2 id="sov-heading" className="text-lg font-semibold">
          Schedule of values
        </h2>
        <div className="mt-3 max-w-xl overflow-hidden rounded-md border bg-card">
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
