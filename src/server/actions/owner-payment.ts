/**
 * Record an owner payment and run the waterfall in one transaction.
 * Idempotent: the same (project, reference, amount, receivedAt) is a no-op that returns the first result.
 */
import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray, lte } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { planWaterfall, type Candidate, type WaterfallPlan } from "@/domain/waterfall/engine";
import { overlayFor } from "@/domain/statutes/ca";
import { effectiveValues, type StoredRules } from "@/server/rules/review";
import { emit, post, type Actor } from "@/server/events";
import { sha256Hex } from "@/lib/ids";
import { isoDate } from "@/server/clock";
import type { DbLike } from "@/server/db-types";
import type { WaiverFields } from "@/domain/waivers/ca";

export type RecordOwnerPaymentInput = {
  projectId: string;
  amountCents: number;
  receivedAt: Date;
  periodThrough: string;
  reference: string;
  includesRetention?: boolean;
  exclusions?: string[];
  source?: "manual" | "webhook";
  idempotencyKey?: string;
  actor: Actor;
  id?: string;
};

/** Everything the engine needs, read from the database. Also used by replay. */
export async function loadCandidates(tx: DbLike, projectId: string, beforeEventId?: string): Promise<Candidate[]> {
  const project = await tx.query.projects.findFirst({ where: eq(schema.projects.id, projectId) });
  if (!project) throw new Error("project not found");
  const contracts = await tx.query.contracts.findMany({
    where: and(eq(schema.contracts.projectId, projectId), eq(schema.contracts.status, "active")),
  });
  if (!contracts.length) return [];
  const ruleSets = await tx.query.ruleSets.findMany({
    where: inArray(schema.ruleSets.id, contracts.map((c) => c.activeRuleSetId!).filter(Boolean)),
  });
  const apps = await tx.query.payApplications.findMany({
    where: and(
      inArray(schema.payApplications.contractId, contracts.map((c) => c.id)),
      inArray(schema.payApplications.status, ["approved", "funded"]),
    ),
    orderBy: [asc(schema.payApplications.number)],
  });
  const releases = await tx.query.releases.findMany({
    where: inArray(schema.releases.contractId, contracts.map((c) => c.id)),
    with: { event: true },
  });
  // For replay: reconstruct the world as of the moment `beforeEventId` was recorded, using database
  // insertion time (not the owner's backdated receipt time) so ordering is monotonic.
  let cutoff: Date | null = null;
  let approvedBefore: Set<string> | null = null;
  if (beforeEventId) {
    const ev = await tx.query.ownerPaymentEvents.findFirst({ where: eq(schema.ownerPaymentEvents.id, beforeEventId) });
    cutoff = ev?.createdAt ?? null;
    if (cutoff) {
      const approvals = await tx.query.events.findMany({ where: and(eq(schema.events.type, "pay_app.approved"), lte(schema.events.createdAt, cutoff)) });
      approvedBefore = new Set(approvals.map((e) => e.aggregateId));
    }
  }
  const counted = releases.filter((r) => (cutoff ? r.event.createdAt < cutoff : true));

  return apps
    .filter((a) => (approvedBefore ? approvedBefore.has(a.id) : true))
    .map((a) => {
      const contract = contracts.find((c) => c.id === a.contractId)!;
      const stored = ruleSets.find((r) => r.id === contract.activeRuleSetId)!.rules as StoredRules;
      const v = effectiveValues(stored);
      const mine = counted.filter((r) => r.payApplicationId === a.id);
      const onContract = counted.filter((r) => r.contractId === a.contractId);
      return {
        payAppId: a.id,
        contractId: a.contractId,
        contractSumCents: contract.contractSumCents,
        isFinal: a.isFinal,
        approvedOn: isoDate(a.reviewedAt ?? a.submittedAt ?? a.createdAt),
        grossCents: a.workThisPeriodCents + a.storedMaterialsCents,
        fundedGrossCents: mine.reduce((s, r) => s + r.grossCents, 0),
        retainageHeldToDateCents: onContract.reduce((s, r) => s + r.retainageWithheldCents - ((r.basis as { retentionReleasedCents?: number }).retentionReleasedCents ?? 0), 0),
        offsetCents: 0,
        rules: {
          timingType: v.timing.type,
          timingDays: v.timing.days,
          agreedInWriting: v.timing.agreed_in_writing,
          retainageBps: v.retainage.percent_bps,
          capBps: v.retainage.cap_bps,
        },
        overlay: overlayFor(v.governing_law_state ?? project.state, contract.executedOn),
      };
    })
    .filter((c) => c.grossCents - c.fundedGrossCents > 0);
}

export async function recordOwnerPayment(input: RecordOwnerPaymentInput): Promise<{ eventId: string; plan: WaterfallPlan; duplicate: boolean }> {
  const db = await getDb();
  const key = input.idempotencyKey ?? sha256Hex(`${input.projectId}|${input.reference}|${input.amountCents}|${input.receivedAt.toISOString()}`);
  return db.transaction(async (tx) => {
    const existing = await tx.query.ownerPaymentEvents.findFirst({ where: eq(schema.ownerPaymentEvents.idempotencyKey, key) });
    if (existing) {
      return { eventId: existing.id, duplicate: true, plan: { releases: [], unfunded: [], unallocatedCents: 0, warnings: [] } };
    }
    const project = await tx.query.projects.findFirst({ where: eq(schema.projects.id, input.projectId), with: { gc: true, owner: true } });
    if (!project) throw new Error("project not found");
    const eventId = input.id ?? randomUUID();
    const correlationId = eventId;
    const exclusions = input.exclusions ?? [];
    await tx.insert(schema.ownerPaymentEvents).values({
      id: eventId,
      projectId: input.projectId,
      amountCents: input.amountCents,
      receivedAt: input.receivedAt,
      periodThrough: input.periodThrough,
      reference: input.reference,
      includesRetention: input.includesRetention ?? false,
      idempotencyKey: key,
      source: input.source ?? "manual",
      exclusions,
      recordedBy: input.actor.userId,
    });

    const candidates = await loadCandidates(tx, input.projectId);
    const plan = planWaterfall(
      { eventId, amountCents: input.amountCents, receivedAt: input.receivedAt, periodThrough: input.periodThrough, includesRetention: input.includesRetention ?? false, exclusions },
      candidates,
    );

    const domainEventId = await emit(tx, {
      aggregateType: "project",
      aggregateId: input.projectId,
      type: "owner_payment.recorded",
      actor: input.actor,
      payload: { eventId, amountCents: input.amountCents, reference: input.reference, releases: plan.releases.length, unallocatedCents: plan.unallocatedCents, warnings: plan.warnings },
      correlationId,
    });
    await post(tx, [
      { projectId: input.projectId, contractId: null, account: "owner_receipts", deltaCents: input.amountCents, eventId: domainEventId, correlationId, memo: `Owner payment ${input.reference}` },
      { projectId: input.projectId, contractId: null, account: "gc_cash", deltaCents: input.amountCents, eventId: domainEventId, correlationId, memo: `Owner payment ${input.reference} received` },
    ]);

    for (const r of plan.releases) {
      const releaseId = randomUUID();
      const candidate = candidates.find((c) => c.payAppId === r.payAppId)!;
      const contract = await tx.query.contracts.findFirst({ where: eq(schema.contracts.id, r.contractId), with: { sub: true } });
      await tx.insert(schema.releases).values({
        id: releaseId,
        eventId,
        payApplicationId: r.payAppId,
        contractId: r.contractId,
        grossCents: r.grossCents,
        retainageWithheldCents: r.retainageWithheldCents,
        offsetCents: r.offsetCents,
        releaseCents: r.releaseCents,
        awaitingOwnerCents: r.awaitingOwnerCents,
        basis: { ...r.basis, retentionReleasedCents: r.retentionReleasedCents, waiverForm: r.waiverForm },
        payByAt: r.payByAt,
        retentionByAt: r.retentionByAt,
        status: r.releaseCents > 0 ? "awaiting_waiver" : "blocked",
      });
      // Draft the conditional waiver for this release and send it to the sub.
      const fields: WaiverFields = {
        form: r.waiverForm,
        claimant: contract!.sub.name,
        customer: project.gc.name,
        jobLocation: project.address ?? project.name,
        owner: project.owner.name,
        throughDate: r.waiverForm === "cp_8132" ? input.periodThrough : null,
        amountCents: r.releaseCents,
        disputedClaimsCents: r.waiverForm === "cf_8136" ? 0 : null,
        exceptions: null,
      };
      await tx.insert(schema.lienWaivers).values({
        id: randomUUID(),
        releaseId,
        contractId: r.contractId,
        form: r.waiverForm,
        status: r.releaseCents > 0 ? "sent" : "void",
        fields,
      });
      const fullyFunded = candidate.fundedGrossCents + r.grossCents >= candidate.grossCents;
      await tx
        .update(schema.payApplications)
        .set({ status: fullyFunded ? "funded" : "approved" })
        .where(eq(schema.payApplications.id, r.payAppId));
      const relEvent = await emit(tx, {
        aggregateType: "release",
        aggregateId: releaseId,
        type: "release.planned",
        actor: { userId: null, label: "Groundwork engine" },
        payload: { ...r, releaseId },
        correlationId,
      });
      await post(tx, [
        { projectId: input.projectId, contractId: r.contractId, account: "sub_payable", deltaCents: r.releaseCents, eventId: relEvent, correlationId, memo: `Release planned for ${contract!.sub.name}` },
        ...(r.retainageWithheldCents
          ? [{ projectId: input.projectId, contractId: r.contractId, account: "retainage_held" as const, deltaCents: r.retainageWithheldCents, eventId: relEvent, correlationId, memo: `Retainage withheld from ${contract!.sub.name}` }]
          : []),
        ...(r.retentionReleasedCents
          ? [{ projectId: input.projectId, contractId: r.contractId, account: "retainage_held" as const, deltaCents: -r.retentionReleasedCents, eventId: relEvent, correlationId, memo: `Retainage released to ${contract!.sub.name}` }]
          : []),
      ]);
    }
    return { eventId, plan, duplicate: false };
  });
}
