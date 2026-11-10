/**
 * The lower tier: a subcontractor's own sub-subcontractors and suppliers.
 *
 * A lower-tier agreement is an ordinary contract one hop down (parentContractId set), so the same
 * rule set, pay applications, waterfall, waivers and rail apply. Lower-tier parties need no account:
 * their terms are typed in by the subcontractor that hires them, their applications are declared on
 * the subcontractor's own pay application, and they sign waivers from a link.
 */
import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { RULE_FIELDS, getField, type RuleFieldPath, type TimingType } from "@/domain/rules/schema";
import { manualRuleSet } from "@/domain/rules/manual";
import { overlayFor } from "@/domain/statutes";
import { approvedHash, type FieldAnnotation, type StoredRules } from "@/server/rules/review";
import { emit, type Actor } from "@/server/events";
import { now, isoDate } from "@/server/clock";
import type { DbLike } from "@/server/db-types";

export type LowerTierKind = "supplier" | "subcontractor";

export async function addLowerTierParty(input: {
  parentContractId: string;
  name: string;
  kind: LowerTierKind;
  scope: string;
  sumCents: number;
  retainageBps?: number;
  timingDays?: number | null;
  timingType?: TimingType;
  actor: Actor;
  id?: string;
}) {
  if (input.name.trim().length < 2) throw new Error("name the lower-tier party");
  if (!Number.isInteger(input.sumCents) || input.sumCents <= 0) throw new Error("enter the agreement amount");
  const retainageBps = input.retainageBps ?? 0;
  if (!Number.isInteger(retainageBps) || retainageBps < 0 || retainageBps > 2000) throw new Error("retainage must be between 0% and 20%");
  const db = await getDb();
  return db.transaction(async (tx) => {
    const parent = await tx.query.contracts.findFirst({ where: eq(schema.contracts.id, input.parentContractId), with: { sub: true, project: { with: { owner: true } } } });
    if (!parent) throw new Error("contract not found");
    if (parent.parentContractId) throw new Error("lower-tier parties are added under a subcontract, not under another lower-tier agreement");
    const id = input.id ?? randomUUID();
    const orgId = randomUUID();
    const slug = `${input.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}-${orgId.slice(0, 6)}`;
    await tx.insert(schema.organizations).values({ id: orgId, kind: "sub", name: input.name.trim(), slug });
    const extracted = manualRuleSet({
      payer: parent.sub.name,
      payee: input.name.trim(),
      owner: parent.project.owner.name,
      project: parent.project.name,
      state: parent.project.state,
      timingType: input.timingType ?? "pay_when_paid",
      timingDays: input.timingDays ?? null,
      retainageBps,
    });
    const annotations = Object.fromEntries(
      RULE_FIELDS.map((p) => {
        const f = getField(extracted, p);
        const a: FieldAnnotation = {
          verification: { status: "none", page: null, score: null },
          review: { state: "accepted", reasons: [f.not_found ? "Not stated; the engine treats it as absent." : `Entered by ${parent.sub.name}; no document was compiled.`], override: null },
        };
        return [p, a];
      }),
    ) as Record<RuleFieldPath, FieldAnnotation>;
    const executedOn = isoDate(now());
    const stored: StoredRules = { extracted, annotations, overlay: overlayFor(parent.project.state, executedOn), anomalyAcks: {} };
    const ruleSetId = randomUUID();
    await tx.insert(schema.contracts).values({
      id,
      projectId: parent.projectId,
      gcOrgId: parent.subOrgId,
      subOrgId: orgId,
      title: `${input.kind === "supplier" ? "Supply agreement" : "Sub-subcontract"} — ${input.scope.trim() || input.name.trim()}`,
      trade: input.scope.trim() || (input.kind === "supplier" ? "Materials" : "Labor"),
      contractSumCents: input.sumCents,
      executedOn,
      status: "active",
      activeRuleSetId: ruleSetId,
      parentContractId: parent.id,
      lowerTierKind: input.kind,
    });
    await tx.insert(schema.ruleSets).values({ id: ruleSetId, contractId: id, version: 1, status: "approved", rules: stored, model: "manual", promptVersion: "manual-1", extractionMs: 0, approvedBy: input.actor.userId, approvedAt: now(), approvedHash: approvedHash(stored) });
    await tx.insert(schema.sovLines).values({ id: randomUUID(), contractId: id, lineNo: 1, description: input.scope.trim() || "Agreement sum", scheduledValueCents: input.sumCents });
    await emit(tx, { aggregateType: "contract", aggregateId: parent.id, type: "lower_tier.added", actor: input.actor, payload: { contractId: id, name: input.name.trim(), kind: input.kind, sumCents: input.sumCents, retainageBps }, correlationId: randomUUID() });
    return { id, orgId };
  });
}

/** Lower-tier agreements under a contract, with what has been declared, funded and signed. */
export async function listLowerTier(tx: DbLike, parentContractId: string) {
  const children = await tx.query.contracts.findMany({
    where: eq(schema.contracts.parentContractId, parentContractId),
    with: { sub: true, sovLines: true, payApplications: { orderBy: [asc(schema.payApplications.number)] } },
    orderBy: [desc(schema.contracts.contractSumCents)],
  });
  if (!children.length) return [];
  const releases = await tx.query.releases.findMany({
    where: inArray(schema.releases.contractId, children.map((c) => c.id)),
    with: { waivers: { orderBy: [desc(schema.lienWaivers.createdAt)] }, payment: true, payApplication: true, event: true },
    orderBy: [desc(schema.releases.createdAt)],
  });
  return children.map((c) => {
    const mine = releases.filter((r) => r.contractId === c.id);
    const billedCents = c.payApplications.reduce((s, a) => s + a.workThisPeriodCents + a.storedMaterialsCents, 0);
    return {
      ...c,
      releases: mine,
      billedCents,
      remainingCents: c.contractSumCents - billedCents,
      paidCents: mine.filter((r) => r.status === "paid" || r.status === "settled").reduce((s, r) => s + r.releaseCents, 0),
      owedCents: mine.filter((r) => !["paid", "settled", "blocked"].includes(r.status)).reduce((s, r) => s + r.releaseCents, 0),
    };
  });
}

/**
 * When an upstream application is approved, the amounts it declared for the lower tier become
 * approved applications one hop down: the subcontractor that owes the money is the one declaring it.
 */
export async function createDeclaredApplications(tx: DbLike, parentApp: { id: string; contractId: string; periodThrough: string; lowerTier: { contractId: string; amountCents: number }[] }, actor: Actor) {
  const created: string[] = [];
  for (const d of parentApp.lowerTier) {
    if (d.amountCents <= 0) continue;
    const child = await tx.query.contracts.findFirst({ where: and(eq(schema.contracts.id, d.contractId), eq(schema.contracts.parentContractId, parentApp.contractId)), with: { sovLines: true, payApplications: true } });
    if (!child) throw new Error("a declared lower-tier party is not on this contract");
    const rs = child.activeRuleSetId ? await tx.query.ruleSets.findFirst({ where: eq(schema.ruleSets.id, child.activeRuleSetId) }) : null;
    const bps = (rs?.rules as StoredRules | undefined)?.extracted.retainage.percent_bps.value ?? 0;
    const billed = child.payApplications.reduce((s, a) => s + a.workThisPeriodCents + a.storedMaterialsCents, 0);
    if (billed + d.amountCents > child.contractSumCents) throw new Error(`the amount declared for a lower-tier party exceeds what is left on its agreement`);
    const id = randomUUID();
    const number = child.payApplications.reduce((m, a) => Math.max(m, a.number), 0) + 1;
    const retainage = Math.round((d.amountCents * bps) / 10_000);
    const at = now();
    await tx.insert(schema.payApplications).values({
      id,
      contractId: child.id,
      number,
      periodThrough: parentApp.periodThrough,
      status: "approved",
      workThisPeriodCents: d.amountCents,
      previouslyBilledCents: billed,
      retainageBilledCents: retainage,
      netDueBilledCents: d.amountCents - retainage,
      retainageApprovedCents: retainage,
      netDueApprovedCents: d.amountCents - retainage,
      submittedBy: actor.userId,
      submittedAt: at,
      reviewedBy: actor.userId,
      reviewedAt: at,
      reviewNote: "Declared on the upstream pay application.",
      parentPayApplicationId: parentApp.id,
    });
    await tx.insert(schema.payApplicationLines).values({ id: randomUUID(), payApplicationId: id, sovLineId: child.sovLines[0].id, previouslyCompletedCents: billed, thisPeriodCents: d.amountCents, storedCents: 0 });
    await emit(tx, { aggregateType: "pay_application", aggregateId: id, type: "pay_app.approved", actor, payload: { contractId: child.id, number, grossCents: d.amountCents, declaredOn: parentApp.id, retainageApprovedCents: retainage, netDueApprovedCents: d.amountCents - retainage }, correlationId: randomUUID() });
    created.push(id);
  }
  return created;
}
