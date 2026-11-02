/** Build the facts for a release and have them narrated; the result is kept as a domain event. */
import { randomUUID } from "node:crypto";
import { desc, eq, and } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { explainPayment, type ExplainInput } from "@/lib/ai/explainPayment";
import { emit, SYSTEM } from "@/server/events";
import { getField, type ExtractedRuleSet, type RuleFieldPath } from "@/domain/rules/schema";
import { fieldLabel, type StoredRules } from "@/server/rules/review";
import type { StatuteId } from "@/domain/statutes/ca";

export async function latestExplanation(releaseId: string) {
  const db = await getDb();
  const ev = await db.query.events.findFirst({
    where: and(eq(schema.events.aggregateId, releaseId), eq(schema.events.type, "release.explained")),
    orderBy: [desc(schema.events.createdAt)],
  });
  return ev ? (ev.payload as { explanation: string; nextStep: string; model: string; status: string }) : null;
}

export async function explainRelease(releaseId: string) {
  const db = await getDb();
  const r = await db.query.releases.findFirst({
    where: eq(schema.releases.id, releaseId),
    with: { event: true, payApplication: true, contract: { with: { sub: true, project: { with: { gc: true, owner: true } } } } },
  });
  if (!r) throw new Error("release not found");
  const basis = r.basis as { rulePaths: string[]; statutes: StatuteId[]; math: { label: string; cents: number }[]; notes: string[] };
  const active = r.contract.activeRuleSetId ? await db.query.ruleSets.findFirst({ where: eq(schema.ruleSets.id, r.contract.activeRuleSetId) }) : null;
  const extracted = active ? (active.rules as StoredRules).extracted : null;
  const quotes = extracted
    ? [...new Set(basis.rulePaths)]
        .map((p) => {
          const f = getField(extracted as ExtractedRuleSet, p as RuleFieldPath);
          return f.evidence ? { label: fieldLabel(p as RuleFieldPath), quote: f.evidence.quote, page: f.evidence.page } : null;
        })
        .filter((q): q is { label: string; quote: string; page: number } => q !== null)
    : [];
  const input: ExplainInput = {
    subName: r.contract.sub.name,
    gcName: r.contract.project.gc.name,
    ownerName: r.contract.project.owner.name,
    ownerPaymentCents: r.event.amountCents,
    ownerReference: r.event.reference,
    payAppNumber: r.payApplication.number,
    math: basis.math,
    statutes: basis.statutes,
    notes: basis.notes,
    quotes,
    payByIso: r.payByAt?.toISOString() ?? null,
    status: r.status,
  };
  const out = await explainPayment(input);
  await emit(db, {
    aggregateType: "release",
    aggregateId: releaseId,
    type: "release.explained",
    actor: SYSTEM,
    payload: { ...out, status: r.status },
    correlationId: randomUUID(),
  });
  return out;
}
