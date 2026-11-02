import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireAuth } from "@/server/auth";
import { getContract } from "@/server/scoped";
import { getDb, schema } from "@/db/client";
import { eq, inArray } from "drizzle-orm";
import { effectiveValues, type StoredRules } from "@/server/rules/review";
import { PayAppForm } from "@/components/pay-app-form";
import { ID } from "@/db/seed";
import { stableId } from "@/lib/ids";
import { dollars } from "@/lib/money";

export default async function NewPayAppPage({ searchParams }: { searchParams: Promise<{ contract?: string }> }) {
  const { contract: contractId } = await searchParams;
  const { org } = await requireAuth("sub");
  if (!contractId) redirect("/sub");
  const contract = await getContract(org, contractId);
  if (!contract) notFound();
  const db = await getDb();
  const approved = contract.payApplications.filter((p) => ["approved", "funded", "closed"].includes(p.status));
  const priorLines = approved.length
    ? await db.query.payApplicationLines.findMany({ where: inArray(schema.payApplicationLines.payApplicationId, approved.map((p) => p.id)) })
    : [];
  const active = contract.activeRuleSetId ? await db.query.ruleSets.findFirst({ where: eq(schema.ruleSets.id, contract.activeRuleSetId) }) : null;
  const rules = active ? effectiveValues(active.rules as StoredRules) : null;
  const nextNumber = (contract.payApplications.reduce((m, p) => Math.max(m, p.number), 0) || 0) + 1;
  const lastThrough = contract.payApplications[0]?.periodThrough;
  const periodThrough = lastThrough
    ? (() => {
        const d = new Date(`${lastThrough}T00:00:00Z`);
        d.setUTCMonth(d.getUTCMonth() + 2, 0);
        return d.toISOString().slice(0, 10);
      })()
    : "2026-09-30";
  const lines = contract.sovLines.map((l) => ({
    id: l.id,
    lineNo: l.lineNo,
    description: l.description,
    scheduledValueCents: l.scheduledValueCents,
    previouslyCents: priorLines.filter((p) => p.sovLineId === l.id).reduce((s, p) => s + p.thisPeriodCents + p.storedCents, 0),
  }));
  const previouslyBilledCents = approved.reduce((s, p) => s + p.workThisPeriodCents + p.storedMaterialsCents, 0);
  // Demo shortcut: Summit's second application, as the seed scenario has it (5% retainage instead of 10%).
  const prefill =
    contract.id === ID.contract.summit && nextNumber === 2
      ? { lines: { [stableId(`sov:${contract.id}:2`)]: dollars(40_000), [stableId(`sov:${contract.id}:3`)]: dollars(10_000) }, retainage: dollars(2_500) }
      : undefined;

  return (
    <div>
      <Link href={`/sub/contracts/${contract.id}`} className="text-sm text-muted-foreground hover:underline">
        ← {contract.trade}
      </Link>
      <h1 className="mt-2 text-2xl font-semibold">Pay application #{nextNumber}</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {contract.project.name} · {contract.project.gc.name}
        {rules?.retainage.percent_bps !== null && rules ? ` · contract retainage ${rules.retainage.percent_bps / 100}%` : ""}
      </p>
      <div className="mt-5">
        <PayAppForm contractId={contract.id} nextNumber={nextNumber} periodThrough={periodThrough} lines={lines} previouslyBilledCents={previouslyBilledCents} retainageBps={rules?.retainage.percent_bps ?? null} prefill={prefill} />
      </div>
    </div>
  );
}
