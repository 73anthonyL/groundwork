/** Pay applications: submit (sub) → deterministic checks → approve / request changes (GC). */
import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { runPayAppChecks, type Check } from "@/domain/payapp/checks";
import { effectiveValues, type StoredRules } from "@/server/rules/review";
import { emit, type Actor } from "@/server/events";
import { now } from "@/server/clock";
import type { DbLike } from "@/server/db-types";

export type SubmitPayAppInput = {
  contractId: string;
  number: number;
  periodThrough: string;
  isFinal?: boolean;
  lines: { sovLineId: string; thisPeriodCents: number; storedCents: number }[];
  /** What the sub says it is withholding and billed before (checked, not trusted). */
  retainageBilledCents: number;
  previouslyBilledCents: number;
  actor: Actor;
  id?: string;
};

export async function payAppContext(tx: DbLike, contractId: string) {
  const contract = await tx.query.contracts.findFirst({
    where: eq(schema.contracts.id, contractId),
    with: { sovLines: { orderBy: [asc(schema.sovLines.lineNo)] } },
  });
  if (!contract) throw new Error("contract not found");
  const active = contract.activeRuleSetId
    ? await tx.query.ruleSets.findFirst({ where: eq(schema.ruleSets.id, contract.activeRuleSetId) })
    : null;
  const rules = active ? effectiveValues(active.rules as StoredRules) : null;
  const prior = await tx.query.payApplications.findMany({
    where: and(eq(schema.payApplications.contractId, contractId), inArray(schema.payApplications.status, ["approved", "funded", "closed"])),
    with: { lines: true },
    orderBy: [asc(schema.payApplications.number)],
  });
  return {
    contract,
    rules,
    ctx: {
      contractSumCents: contract.contractSumCents,
      sov: contract.sovLines.map((l) => ({ id: l.id, lineNo: l.lineNo, description: l.description, scheduledValueCents: l.scheduledValueCents })),
      rules: rules ? { retainageBps: rules.retainage.percent_bps, storedMaterialsAllowed: rules.stored_materials } : null,
      prior: prior.map((p) => ({ number: p.number, periodThrough: p.periodThrough, grossApprovedCents: p.workThisPeriodCents + p.storedMaterialsCents })),
    },
    priorLines: prior.flatMap((p) => p.lines),
  };
}

export async function submitPayApp(input: SubmitPayAppInput) {
  const db = await getDb();
  return db.transaction(async (tx) => {
    const { ctx, priorLines } = await payAppContext(tx, input.contractId);
    const lines = input.lines.map((l) => ({
      sovLineId: l.sovLineId,
      previouslyCompletedCents: priorLines.filter((p) => p.sovLineId === l.sovLineId).reduce((s, p) => s + p.thisPeriodCents + p.storedCents, 0),
      thisPeriodCents: l.thisPeriodCents,
      storedCents: l.storedCents,
    }));
    const workThisPeriodCents = lines.reduce((s, l) => s + l.thisPeriodCents, 0);
    const storedMaterialsCents = lines.reduce((s, l) => s + l.storedCents, 0);
    const gross = workThisPeriodCents + storedMaterialsCents;
    const app = {
      number: input.number,
      periodThrough: input.periodThrough,
      isFinal: input.isFinal ?? false,
      lines,
      workThisPeriodCents,
      storedMaterialsCents,
      previouslyBilledCents: input.previouslyBilledCents,
      retainageBilledCents: input.retainageBilledCents,
      netDueBilledCents: gross - input.retainageBilledCents,
    };
    const result = runPayAppChecks(app, ctx);
    const id = input.id ?? randomUUID();
    const at = now();
    await tx.insert(schema.payApplications).values({
      id,
      contractId: input.contractId,
      number: app.number,
      periodThrough: app.periodThrough,
      isFinal: app.isFinal,
      status: "submitted",
      workThisPeriodCents,
      storedMaterialsCents,
      previouslyBilledCents: app.previouslyBilledCents,
      retainageBilledCents: app.retainageBilledCents,
      netDueBilledCents: app.netDueBilledCents,
      checks: result.checks,
      flags: [],
      submittedBy: input.actor.userId,
      submittedAt: at,
    });
    await tx.insert(schema.payApplicationLines).values(lines.map((l) => ({ id: randomUUID(), payApplicationId: id, ...l })));
    await emit(tx, {
      aggregateType: "pay_application",
      aggregateId: id,
      type: "pay_app.submitted",
      actor: input.actor,
      payload: { contractId: input.contractId, number: app.number, grossCents: gross, failing: result.checks.filter((c) => c.status === "fail").map((c) => c.id) },
      correlationId: randomUUID(),
    });
    return { id, checks: result.checks as Check[], blocking: result.blocking, grossCents: gross };
  });
}

export async function setPayAppFlags(payAppId: string, flags: unknown[]) {
  const db = await getDb();
  await db.update(schema.payApplications).set({ flags }).where(eq(schema.payApplications.id, payAppId));
}

export async function reviewPayApp(input: {
  payAppId: string;
  decision: "approve" | "request_changes";
  /** Apply the deterministic correction (retainage at the contract rate) before approving. */
  applyCorrection?: boolean;
  note?: string;
  actor: Actor;
}) {
  const db = await getDb();
  return db.transaction(async (tx) => {
    const app = await tx.query.payApplications.findFirst({ where: eq(schema.payApplications.id, input.payAppId), with: { lines: true } });
    if (!app) throw new Error("pay application not found");
    if (app.status !== "submitted" && app.status !== "changes_requested") throw new Error(`cannot review a pay application in status ${app.status}`);
    const at = now();
    if (input.decision === "request_changes") {
      await tx
        .update(schema.payApplications)
        .set({ status: "changes_requested", reviewedBy: input.actor.userId, reviewedAt: at, reviewNote: input.note ?? null })
        .where(eq(schema.payApplications.id, app.id));
      await emit(tx, { aggregateType: "pay_application", aggregateId: app.id, type: "pay_app.changes_requested", actor: input.actor, payload: { note: input.note ?? null }, correlationId: randomUUID() });
      return { status: "changes_requested" as const };
    }
    const { ctx } = await payAppContext(tx, app.contractId);
    const result = runPayAppChecks(
      {
        number: app.number,
        periodThrough: app.periodThrough,
        isFinal: app.isFinal,
        lines: app.lines,
        workThisPeriodCents: app.workThisPeriodCents,
        storedMaterialsCents: app.storedMaterialsCents,
        previouslyBilledCents: app.previouslyBilledCents,
        retainageBilledCents: app.retainageBilledCents,
        netDueBilledCents: app.netDueBilledCents,
      },
      ctx,
    );
    const failing = result.checks.filter((c) => c.status === "fail");
    const onlyRetainage = failing.length === 1 && failing[0].id === "retainage_rate";
    if (failing.length && !(onlyRetainage && input.applyCorrection)) {
      throw new Error(`cannot approve: failing checks ${failing.map((c) => c.id).join(", ")}`);
    }
    const retainageApproved = input.applyCorrection ? result.expectedRetainageCents : app.retainageBilledCents;
    const netApproved = result.grossCents - retainageApproved;
    await tx
      .update(schema.payApplications)
      .set({
        status: "approved",
        retainageApprovedCents: retainageApproved,
        netDueApprovedCents: netApproved,
        checks: result.checks,
        reviewedBy: input.actor.userId,
        reviewedAt: at,
        reviewNote: input.note ?? null,
      })
      .where(eq(schema.payApplications.id, app.id));
    await emit(tx, {
      aggregateType: "pay_application",
      aggregateId: app.id,
      type: "pay_app.approved",
      actor: input.actor,
      payload: { corrected: Boolean(input.applyCorrection && onlyRetainage), retainageApprovedCents: retainageApproved, netDueApprovedCents: netApproved, grossCents: result.grossCents },
      correlationId: randomUUID(),
    });
    return { status: "approved" as const, retainageApprovedCents: retainageApproved, netDueApprovedCents: netApproved };
  });
}
