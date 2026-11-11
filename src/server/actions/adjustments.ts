/**
 * Adjustments to a contract after its rules are approved: backcharges (setoff), change orders
 * (contract sum), and retention certifications (the release condition has been met).
 * Each is a recorded human decision; the engine reads them on the next funding event.
 */
import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { effectiveValues, type StoredRules } from "@/server/rules/review";
import { emit, type Actor } from "@/server/events";
import { now } from "@/server/clock";
import type { DbLike } from "@/server/db-types";

async function approvedRules(tx: DbLike, contractId: string) {
  const contract = await tx.query.contracts.findFirst({ where: eq(schema.contracts.id, contractId) });
  if (!contract) throw new Error("contract not found");
  if (!contract.activeRuleSetId) throw new Error("this subcontract has no approved payment rules yet");
  const rs = await tx.query.ruleSets.findFirst({ where: eq(schema.ruleSets.id, contract.activeRuleSetId) });
  if (!rs) throw new Error("approved rule set not found");
  return { contract, values: effectiveValues(rs.rules as StoredRules) };
}

// ─── Backcharges ────────────────────────────────────────────────────────────

/** Totals for one contract: what was charged, what releases have set off, what is still to recover. */
export async function backchargeBalance(tx: DbLike, contractId: string) {
  const rows = await tx.query.backcharges.findMany({ where: eq(schema.backcharges.contractId, contractId), orderBy: [desc(schema.backcharges.createdAt)] });
  const releases = await tx.query.releases.findMany({ where: eq(schema.releases.contractId, contractId) });
  const chargedCents = rows.filter((b) => b.status === "open").reduce((s, b) => s + b.amountCents, 0);
  const appliedCents = releases.reduce((s, r) => s + r.offsetCents, 0);
  return { rows, chargedCents, appliedCents, outstandingCents: Math.max(0, chargedCents - appliedCents) };
}

export async function recordBackcharge(input: { contractId: string; amountCents: number; reason: string; noticeDate?: string | null; actor: Actor; id?: string }) {
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) throw new Error("enter the backcharge amount in dollars");
  if (input.reason.trim().length < 3) throw new Error("say what the backcharge is for");
  const db = await getDb();
  return db.transaction(async (tx) => {
    const { values } = await approvedRules(tx, input.contractId);
    // The right to set off comes from the contract. No clause, no deduction.
    if (values.offsets.backcharge_setoff !== true) throw new Error("this subcontract's approved payment rules do not allow backcharges");
    const id = input.id ?? randomUUID();
    await tx.insert(schema.backcharges).values({ id, contractId: input.contractId, amountCents: input.amountCents, reason: input.reason.trim(), noticeDate: input.noticeDate ?? null, createdBy: input.actor.userId });
    await emit(tx, { aggregateType: "contract", aggregateId: input.contractId, type: "backcharge.recorded", actor: input.actor, payload: { backchargeId: id, amountCents: input.amountCents, reason: input.reason.trim(), noticeDate: input.noticeDate ?? null }, correlationId: randomUUID() });
    return { id };
  });
}

/** Withdraw a backcharge. Amounts already set off stay set off; only the unrecovered part is dropped. */
export async function voidBackcharge(input: { backchargeId: string; actor: Actor }) {
  const db = await getDb();
  return db.transaction(async (tx) => {
    const b = await tx.query.backcharges.findFirst({ where: eq(schema.backcharges.id, input.backchargeId) });
    if (!b) throw new Error("backcharge not found");
    if (b.status === "void") return { id: b.id };
    const { appliedCents, chargedCents } = await backchargeBalance(tx, b.contractId);
    if (chargedCents - b.amountCents < appliedCents) throw new Error("this backcharge has already been deducted from a payment and cannot be withdrawn");
    // Database time, so replay compares it with event insertion times on one clock.
    await tx.update(schema.backcharges).set({ status: "void", voidedAt: sql`now()` }).where(eq(schema.backcharges.id, b.id));
    await emit(tx, { aggregateType: "contract", aggregateId: b.contractId, type: "backcharge.voided", actor: input.actor, payload: { backchargeId: b.id, amountCents: b.amountCents }, correlationId: randomUUID() });
    return { id: b.id };
  });
}

// ─── Change orders ──────────────────────────────────────────────────────────

export async function proposeChangeOrder(input: { contractId: string; title: string; description?: string | null; amountCents: number; sovLineId?: string | null; actor: Actor; id?: string }) {
  if (!Number.isInteger(input.amountCents) || input.amountCents === 0) throw new Error("enter the change order amount in dollars");
  if (input.title.trim().length < 3) throw new Error("give the change order a title");
  if (input.amountCents < 0 && !input.sovLineId) throw new Error("choose the schedule of values line this deduction reduces");
  const db = await getDb();
  return db.transaction(async (tx) => {
    const contract = await tx.query.contracts.findFirst({ where: eq(schema.contracts.id, input.contractId), with: { sovLines: true } });
    if (!contract) throw new Error("contract not found");
    if (input.sovLineId && !contract.sovLines.some((l) => l.id === input.sovLineId)) throw new Error("that line is not on this subcontract");
    const [last] = await tx.select({ n: schema.changeOrders.number }).from(schema.changeOrders).where(eq(schema.changeOrders.contractId, input.contractId)).orderBy(desc(schema.changeOrders.number)).limit(1);
    const number = (last?.n ?? 0) + 1;
    const id = input.id ?? randomUUID();
    await tx.insert(schema.changeOrders).values({ id, contractId: input.contractId, number, title: input.title.trim(), description: input.description?.trim() || null, amountCents: input.amountCents, sovLineId: input.amountCents < 0 ? input.sovLineId : null, requestedBy: input.actor.userId });
    await emit(tx, { aggregateType: "contract", aggregateId: input.contractId, type: "change_order.proposed", actor: input.actor, payload: { changeOrderId: id, number, amountCents: input.amountCents, title: input.title.trim() }, correlationId: randomUUID() });
    return { id, number };
  });
}

/**
 * Approving changes the contract sum and the schedule of values together, so the two always agree:
 * an additive order adds a line; a deductive order reduces a line, never below what was already billed.
 */
export async function decideChangeOrder(input: { changeOrderId: string; decision: "approve" | "reject"; note?: string; actor: Actor }) {
  const db = await getDb();
  return db.transaction(async (tx) => {
    const co = await tx.query.changeOrders.findFirst({ where: eq(schema.changeOrders.id, input.changeOrderId) });
    if (!co) throw new Error("change order not found");
    if (co.status !== "proposed") throw new Error(`this change order has already been ${co.status}`);
    const at = now();
    if (input.decision === "reject") {
      await tx.update(schema.changeOrders).set({ status: "rejected", decidedBy: input.actor.userId, decidedAt: at, decisionNote: input.note ?? null }).where(eq(schema.changeOrders.id, co.id));
      await emit(tx, { aggregateType: "contract", aggregateId: co.contractId, type: "change_order.rejected", actor: input.actor, payload: { changeOrderId: co.id, number: co.number, note: input.note ?? null }, correlationId: randomUUID() });
      return { status: "rejected" as const, contractSumCents: null };
    }
    const contract = await tx.query.contracts.findFirst({ where: eq(schema.contracts.id, co.contractId), with: { sovLines: true } });
    if (!contract) throw new Error("contract not found");
    let sovLineId = co.sovLineId;
    if (co.amountCents > 0) {
      sovLineId = randomUUID();
      const lineNo = contract.sovLines.reduce((m, l) => Math.max(m, l.lineNo), 0) + 1;
      await tx.insert(schema.sovLines).values({ id: sovLineId, contractId: co.contractId, lineNo, description: `CO-${co.number}: ${co.title}`, scheduledValueCents: co.amountCents });
    } else {
      const line = contract.sovLines.find((l) => l.id === co.sovLineId);
      if (!line) throw new Error("the line this change order reduces no longer exists");
      const apps = await tx.query.payApplications.findMany({ where: and(eq(schema.payApplications.contractId, co.contractId), inArray(schema.payApplications.status, ["submitted", "approved", "funded", "closed"])), with: { lines: true } });
      const billed = apps.flatMap((a) => a.lines).filter((l) => l.sovLineId === line.id).reduce((s, l) => s + l.thisPeriodCents + l.storedCents, 0);
      const next = line.scheduledValueCents + co.amountCents;
      if (next < billed) throw new Error(`cannot reduce "${line.description}" below the ${billed} cents already billed against it`);
      await tx.update(schema.sovLines).set({ scheduledValueCents: next }).where(eq(schema.sovLines.id, line.id));
    }
    const before = contract.contractSumCents;
    const after = before + co.amountCents;
    await tx.update(schema.contracts).set({ contractSumCents: after }).where(eq(schema.contracts.id, co.contractId));
    await tx.update(schema.changeOrders).set({ status: "approved", sovLineId, decidedBy: input.actor.userId, decidedAt: at, decisionNote: input.note ?? null }).where(eq(schema.changeOrders.id, co.id));
    await emit(tx, { aggregateType: "contract", aggregateId: co.contractId, type: "change_order.approved", actor: input.actor, payload: { changeOrderId: co.id, number: co.number, amountCents: co.amountCents, contractSumBeforeCents: before, contractSumAfterCents: after, sovLineId }, correlationId: randomUUID() });
    return { status: "approved" as const, contractSumCents: after };
  });
}

// ─── Retention certifications ───────────────────────────────────────────────

/** Retainage held on a contract, what certifications have earmarked, and what is left to certify. */
export async function retentionPosition(tx: DbLike, contractId: string) {
  const releases = await tx.query.releases.findMany({ where: eq(schema.releases.contractId, contractId) });
  const certifications = await tx.query.retentionCertifications.findMany({ where: eq(schema.retentionCertifications.contractId, contractId), orderBy: [desc(schema.retentionCertifications.createdAt)] });
  const heldCents = releases.reduce((s, r) => s + r.retainageWithheldCents - ((r.basis as { retentionReleasedCents?: number }).retentionReleasedCents ?? 0), 0);
  const pending = certifications.filter((c) => !releases.some((r) => r.certificationId === c.id));
  const earmarkedCents = pending.reduce((s, c) => s + c.amountCents, 0);
  return { heldCents, earmarkedCents, certifiableCents: Math.max(0, heldCents - earmarkedCents), certifications, pendingIds: pending.map((c) => c.id) };
}

/**
 * The controller certifies that the contract's retention release condition has been met for a share
 * of the retainage held. The release itself is planned when the owner's retention is received.
 */
export async function certifyRetention(input: { contractId: string; releaseBps: number; note: string; isFinal?: boolean; actor: Actor; id?: string }) {
  if (!Number.isInteger(input.releaseBps) || input.releaseBps <= 0 || input.releaseBps > 10_000) throw new Error("enter a share to release between 1% and 100%");
  if (input.note.trim().length < 3) throw new Error("say how the release condition was met");
  const db = await getDb();
  return db.transaction(async (tx) => {
    const { values } = await approvedRules(tx, input.contractId);
    const pos = await retentionPosition(tx, input.contractId);
    const amountCents = Math.round((pos.certifiableCents * input.releaseBps) / 10_000);
    if (amountCents <= 0) throw new Error("all the retainage held on this subcontract is already certified for release");
    const id = input.id ?? randomUUID();
    await tx.insert(schema.retentionCertifications).values({ id, contractId: input.contractId, releaseBps: input.releaseBps, amountCents, conditionText: values.retainage.release_condition, note: input.note.trim(), isFinal: input.isFinal ?? false, certifiedBy: input.actor.userId });
    await emit(tx, { aggregateType: "contract", aggregateId: input.contractId, type: "retention.certified", actor: input.actor, payload: { certificationId: id, releaseBps: input.releaseBps, amountCents, heldCents: pos.heldCents, condition: values.retainage.release_condition, note: input.note.trim() }, correlationId: randomUUID() });
    return { id, amountCents };
  });
}
