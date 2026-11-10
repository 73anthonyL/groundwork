/**
 * Record a funding event and run the waterfall in one transaction.
 *
 * A funding event is money arriving at a payer: the owner paying the general contractor, or (one hop
 * down) a subcontractor being paid and owing its own lower tier. Both run the same planner. When a
 * release funds an application that declared lower-tier amounts, the next hop is planned in the same
 * transaction, so the whole chain is visible the moment the owner's money lands.
 *
 * Idempotent: the same (project, reference, amount, receivedAt) is a no-op that returns the first result.
 */
import { randomBytes, randomUUID } from "node:crypto";
import { and, asc, eq, inArray, isNull, lte } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { planWaterfall, type Candidate, type RetentionCandidate, type WaterfallPlan } from "@/domain/waterfall/engine";
import { overlayFor } from "@/domain/statutes/ca";
import { effectiveValues, type StoredRules } from "@/server/rules/review";
import { emit, post, type Actor } from "@/server/events";
import { sha256Hex } from "@/lib/ids";
import { isoDate } from "@/server/clock";
import type { DbLike, Tx } from "@/server/db-types";
import type { WaiverFields } from "@/domain/waivers/ca";

export type RecordOwnerPaymentInput = {
  projectId: string;
  amountCents: number;
  receivedAt: Date;
  periodThrough: string;
  reference: string;
  includesRetention?: boolean;
  /** Portion of the amount that is the owner releasing retention (implies includesRetention). */
  retentionCents?: number;
  exclusions?: string[];
  source?: "manual" | "webhook";
  idempotencyKey?: string;
  actor: Actor;
  id?: string;
};

/** Which payer's contracts a funding event allocates across. */
export type FundingScope = {
  /** Null: the general contractor's subcontracts. Otherwise the upstream contract whose payee is paying. */
  payerContractId: string | null;
  /** One hop down: only applications declared on this upstream application. */
  parentPayApplicationId?: string | null;
  /** Replay: reconstruct the world as of the moment this event was recorded. */
  beforeEventId?: string;
};

export type Loaded = { candidates: (Candidate & { parentPayApplicationId: string | null })[]; retention: RetentionCandidate[] };

/** Everything the engine needs, read from the database. Also used by replay. */
export async function loadCandidates(tx: DbLike, projectId: string, scope: FundingScope = { payerContractId: null }): Promise<Loaded> {
  const project = await tx.query.projects.findFirst({ where: eq(schema.projects.id, projectId) });
  if (!project) throw new Error("project not found");
  const contracts = await tx.query.contracts.findMany({
    where: and(
      eq(schema.contracts.projectId, projectId),
      eq(schema.contracts.status, "active"),
      scope.payerContractId ? eq(schema.contracts.parentContractId, scope.payerContractId) : isNull(schema.contracts.parentContractId),
    ),
  });
  if (!contracts.length) return { candidates: [], retention: [] };
  const contractIds = contracts.map((c) => c.id);
  const ruleSets = await tx.query.ruleSets.findMany({
    where: inArray(schema.ruleSets.id, contracts.map((c) => c.activeRuleSetId!).filter(Boolean)),
  });
  const apps = await tx.query.payApplications.findMany({
    where: and(inArray(schema.payApplications.contractId, contractIds), inArray(schema.payApplications.status, ["approved", "funded"])),
    orderBy: [asc(schema.payApplications.number)],
  });
  const releases = await tx.query.releases.findMany({ where: inArray(schema.releases.contractId, contractIds), with: { event: true } });
  const backcharges = await tx.query.backcharges.findMany({ where: inArray(schema.backcharges.contractId, contractIds) });
  const certifications = await tx.query.retentionCertifications.findMany({
    where: inArray(schema.retentionCertifications.contractId, contractIds),
    orderBy: [asc(schema.retentionCertifications.createdAt)],
  });

  // Replay uses database insertion time (not the payer's backdated receipt time) so ordering is monotonic.
  let cutoff: Date | null = null;
  let approvedBefore: Set<string> | null = null;
  if (scope.beforeEventId) {
    const ev = await tx.query.ownerPaymentEvents.findFirst({ where: eq(schema.ownerPaymentEvents.id, scope.beforeEventId) });
    cutoff = ev?.createdAt ?? null;
    if (cutoff) {
      const approvals = await tx.query.events.findMany({ where: and(eq(schema.events.type, "pay_app.approved"), lte(schema.events.createdAt, cutoff)) });
      approvedBefore = new Set(approvals.map((e) => e.aggregateId));
    }
  }
  const before = (d: Date) => (cutoff ? d < cutoff : true);
  const counted = releases.filter((r) => before(r.event.createdAt));
  const rulesFor = (contractId: string) => {
    const contract = contracts.find((c) => c.id === contractId)!;
    return { contract, v: effectiveValues(ruleSets.find((r) => r.id === contract.activeRuleSetId)!.rules as StoredRules) };
  };

  // Backcharges still to recover per contract: recorded and not voided, less what earlier releases set off.
  const outstanding = new Map<string, number>();
  for (const id of contractIds) {
    const charged = backcharges
      .filter((b) => b.contractId === id && before(b.createdAt) && (b.status === "open" || (cutoff !== null && b.voidedAt !== null && b.voidedAt >= cutoff)))
      .reduce((s, b) => s + b.amountCents, 0);
    const applied = counted.filter((r) => r.contractId === id).reduce((s, r) => s + r.offsetCents, 0);
    outstanding.set(id, Math.max(0, charged - applied));
  }
  const takeOffset = (contractId: string) => {
    const o = outstanding.get(contractId) ?? 0;
    outstanding.set(contractId, 0);
    return o;
  };

  const heldOn = (contractId: string) =>
    counted
      .filter((r) => r.contractId === contractId)
      .reduce((s, r) => s + r.retainageWithheldCents - ((r.basis as { retentionReleasedCents?: number }).retentionReleasedCents ?? 0), 0);
  const pendingCerts = certifications.filter((c) => before(c.createdAt) && !counted.some((r) => r.certificationId === c.id));

  const candidates = apps
    .filter((a) => (approvedBefore ? approvedBefore.has(a.id) : true))
    .filter((a) => (scope.parentPayApplicationId ? a.parentPayApplicationId === scope.parentPayApplicationId : true))
    .map((a) => {
      const { contract, v } = rulesFor(a.contractId);
      const mine = counted.filter((r) => r.payApplicationId === a.id);
      const certified = pendingCerts.filter((c) => c.contractId === a.contractId).reduce((s, c) => s + c.amountCents, 0);
      return {
        payAppId: a.id,
        contractId: a.contractId,
        contractSumCents: contract.contractSumCents,
        isFinal: a.isFinal,
        approvedOn: isoDate(a.reviewedAt ?? a.submittedAt ?? a.createdAt),
        grossCents: a.workThisPeriodCents + a.storedMaterialsCents,
        fundedGrossCents: mine.reduce((s, r) => s + r.grossCents, 0),
        // Retainage a certification already earmarked is paid by its own release, not by the final application.
        retainageHeldToDateCents: Math.max(0, heldOn(a.contractId) - certified),
        offsetCents: 0,
        parentPayApplicationId: a.parentPayApplicationId,
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
  // One setoff per contract per event, against its earliest open application.
  for (const c of candidates) c.offsetCents = takeOffset(c.contractId);

  const retention: RetentionCandidate[] = pendingCerts.map((c) => {
    const { contract, v } = rulesFor(c.contractId);
    return {
      certificationId: c.id,
      contractId: c.contractId,
      amountCents: c.amountCents,
      isFinal: c.isFinal,
      releaseDays: v.retainage.release_days,
      offsetCents: takeOffset(c.contractId),
      overlay: overlayFor(v.governing_law_state ?? project.state, contract.executedOn),
    };
  });
  return { candidates, retention };
}

type EventInput = {
  eventId: string;
  projectId: string;
  amountCents: number;
  retentionCents: number;
  receivedAt: Date;
  periodThrough: string;
  reference: string;
  includesRetention: boolean;
  exclusions: string[];
  source: "manual" | "webhook" | "cascade";
  idempotencyKey: string;
  payerContractId: string | null;
  parentReleaseId: string | null;
  parentPayApplicationId: string | null;
  actor: Actor;
  correlationId: string;
};

const ENGINE: Actor = { userId: null, label: "Groundwork engine" };

/** Insert one funding event, plan it, persist the releases and waivers, then plan the next hop down. */
async function planEvent(tx: Tx, e: EventInput): Promise<WaterfallPlan> {
  const project = await tx.query.projects.findFirst({ where: eq(schema.projects.id, e.projectId), with: { gc: true, owner: true } });
  if (!project) throw new Error("project not found");
  const top = e.payerContractId === null;
  await tx.insert(schema.ownerPaymentEvents).values({
    id: e.eventId,
    projectId: e.projectId,
    amountCents: e.amountCents,
    receivedAt: e.receivedAt,
    periodThrough: e.periodThrough,
    reference: e.reference,
    includesRetention: e.includesRetention,
    retentionCents: e.retentionCents,
    payerContractId: e.payerContractId,
    parentReleaseId: e.parentReleaseId,
    idempotencyKey: e.idempotencyKey,
    source: e.source,
    exclusions: e.exclusions,
    recordedBy: e.actor.userId,
  });

  const { candidates, retention } = await loadCandidates(tx, e.projectId, { payerContractId: e.payerContractId, parentPayApplicationId: e.parentPayApplicationId });
  const plan = planWaterfall(
    { eventId: e.eventId, amountCents: e.amountCents, retentionCents: e.retentionCents, receivedAt: e.receivedAt, periodThrough: e.periodThrough, includesRetention: e.includesRetention, exclusions: e.exclusions },
    candidates,
    retention,
  );

  const domainEventId = await emit(tx, {
    aggregateType: "project",
    aggregateId: e.projectId,
    type: top ? "owner_payment.recorded" : "lower_tier.funded",
    actor: e.actor,
    payload: { eventId: e.eventId, amountCents: e.amountCents, retentionCents: e.retentionCents, reference: e.reference, payerContractId: e.payerContractId, parentReleaseId: e.parentReleaseId, releases: plan.releases.length, unallocatedCents: plan.unallocatedCents, warnings: plan.warnings },
    correlationId: e.correlationId,
  });
  if (top) {
    await post(tx, [
      { projectId: e.projectId, contractId: null, account: "owner_receipts", deltaCents: e.amountCents, eventId: domainEventId, correlationId: e.correlationId, memo: `Owner payment ${e.reference}` },
      { projectId: e.projectId, contractId: null, account: "gc_cash", deltaCents: e.amountCents, eventId: domainEventId, correlationId: e.correlationId, memo: `Owner payment ${e.reference} received` },
    ]);
  }

  for (const r of plan.releases) {
    const releaseId = randomUUID();
    const candidate = r.payAppId ? candidates.find((c) => c.payAppId === r.payAppId)! : null;
    const contract = await tx.query.contracts.findFirst({ where: eq(schema.contracts.id, r.contractId), with: { sub: true, payer: true } });
    if (!contract) throw new Error("contract not found");
    await tx.insert(schema.releases).values({
      id: releaseId,
      eventId: e.eventId,
      kind: r.kind,
      payApplicationId: r.payAppId,
      certificationId: r.certificationId,
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
    // Draft the conditional waiver for this release and send it to the claimant.
    const fields: WaiverFields = {
      form: r.waiverForm,
      claimant: contract.sub.name,
      customer: contract.payer.name,
      jobLocation: project.address ?? project.name,
      owner: project.owner.name,
      throughDate: r.waiverForm === "cp_8132" ? e.periodThrough : null,
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
      // Lower-tier claimants have no account; they sign from a link.
      signToken: top ? null : newSignToken(),
    });
    if (candidate && r.payAppId) {
      const fullyFunded = candidate.fundedGrossCents + r.grossCents >= candidate.grossCents;
      await tx.update(schema.payApplications).set({ status: fullyFunded ? "funded" : "approved" }).where(eq(schema.payApplications.id, r.payAppId));
    }
    const relEvent = await emit(tx, { aggregateType: "release", aggregateId: releaseId, type: "release.planned", actor: ENGINE, payload: { ...r, releaseId }, correlationId: e.correlationId });
    const base = { projectId: e.projectId, contractId: r.contractId, eventId: relEvent, correlationId: e.correlationId };
    if (top) {
      await post(tx, [
        { ...base, account: "sub_payable", deltaCents: r.releaseCents, memo: `Release planned for ${contract.sub.name}` },
        ...(r.retainageWithheldCents ? [{ ...base, account: "retainage_held" as const, deltaCents: r.retainageWithheldCents, memo: `Retainage withheld from ${contract.sub.name}` }] : []),
        ...(r.retentionReleasedCents ? [{ ...base, account: "retainage_held" as const, deltaCents: -r.retentionReleasedCents, memo: `Retainage released to ${contract.sub.name}` }] : []),
        ...(r.offsetCents ? [{ ...base, account: "backcharge_recovered" as const, deltaCents: r.offsetCents, memo: `Backcharge set off against ${contract.sub.name}` }] : []),
      ]);
    } else if (r.releaseCents) {
      await post(tx, [{ ...base, account: "lower_tier_payable", deltaCents: r.releaseCents, memo: `${contract.payer.name} owes ${contract.sub.name}` }]);
    }

    // The next hop: what this payee owes its own lower tier out of the application just funded.
    if (candidate && r.payAppId && r.releaseCents > 0) {
      const children = await tx.query.payApplications.findMany({
        where: and(eq(schema.payApplications.parentPayApplicationId, r.payAppId), inArray(schema.payApplications.status, ["approved", "funded"])),
      });
      if (children.length) {
        const childGross = children.reduce((s, a) => s + a.workThisPeriodCents + a.storedMaterialsCents, 0);
        const childReleases = await tx.query.releases.findMany({ where: inArray(schema.releases.payApplicationId, children.map((a) => a.id)) });
        const childFunded = childReleases.reduce((s, x) => s + x.grossCents, 0);
        // Fund the lower tier in the same proportion the upstream application has now been funded.
        const funded = candidate.fundedGrossCents + r.grossCents;
        const due = Math.round((childGross * funded) / candidate.grossCents) - childFunded;
        const pool = Math.max(0, Math.min(r.releaseCents, due));
        if (pool > 0) {
          await planEvent(tx, {
            eventId: randomUUID(),
            projectId: e.projectId,
            amountCents: pool,
            retentionCents: 0,
            // The payee has this money no later than its own pay-by date; the lower-tier clock runs from receipt.
            receivedAt: r.payByAt ?? e.receivedAt,
            periodThrough: e.periodThrough,
            reference: `${contract.sub.name} · ${e.reference}`,
            includesRetention: false,
            exclusions: [],
            source: "cascade",
            idempotencyKey: sha256Hex(`cascade|${releaseId}`),
            payerContractId: r.contractId,
            parentReleaseId: releaseId,
            parentPayApplicationId: r.payAppId,
            actor: ENGINE,
            correlationId: e.correlationId,
          });
        }
      }
    }
  }
  return plan;
}

export function newSignToken(): string {
  return randomBytes(24).toString("base64url");
}

export async function recordOwnerPayment(input: RecordOwnerPaymentInput): Promise<{ eventId: string; plan: WaterfallPlan; duplicate: boolean }> {
  const db = await getDb();
  const key = input.idempotencyKey ?? sha256Hex(`${input.projectId}|${input.reference}|${input.amountCents}|${input.receivedAt.toISOString()}`);
  const retentionCents = Math.max(0, input.retentionCents ?? 0);
  if (retentionCents > input.amountCents) throw new Error("the retention portion cannot exceed the payment");
  return db.transaction(async (tx) => {
    const existing = await tx.query.ownerPaymentEvents.findFirst({ where: eq(schema.ownerPaymentEvents.idempotencyKey, key) });
    if (existing) {
      return { eventId: existing.id, duplicate: true, plan: { releases: [], unfunded: [], unallocatedCents: 0, warnings: [] } };
    }
    const eventId = input.id ?? randomUUID();
    const plan = await planEvent(tx, {
      eventId,
      projectId: input.projectId,
      amountCents: input.amountCents,
      retentionCents,
      receivedAt: input.receivedAt,
      periodThrough: input.periodThrough,
      reference: input.reference,
      includesRetention: (input.includesRetention ?? false) || retentionCents > 0,
      exclusions: input.exclusions ?? [],
      source: input.source ?? "manual",
      idempotencyKey: key,
      payerContractId: null,
      parentReleaseId: null,
      parentPayApplicationId: null,
      actor: input.actor,
      correlationId: eventId,
    });
    return { eventId, plan, duplicate: false };
  });
}
