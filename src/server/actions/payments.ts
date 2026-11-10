/** Waiver signing, payment initiation through the rail, and settlement via the webhook inbox. */
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { getRail, railName } from "@/server/rails";
import type { RailWebhookEvent } from "@/server/rails/types";
import { emit, post, SYSTEM, type Actor } from "@/server/events";
import { now } from "@/server/clock";
import { sha256Hex } from "@/lib/ids";
import { unconditionalCounterpart, type WaiverFields } from "@/domain/waivers/ca";
import { effectiveValues, type StoredRules } from "@/server/rules/review";
import { newSignToken } from "@/server/actions/owner-payment";

const CLEARED = ["waiver_signed", "payment_initiated", "paid", "settled"];

/** Sub types its name; the hash binds waiver id, fields, signer and time. */
export async function signWaiver(input: { waiverId: string; signerName: string; signerTitle: string; actor: Actor }) {
  const db = await getDb();
  const result = await db.transaction(async (tx) => {
    const w = await tx.query.lienWaivers.findFirst({ where: eq(schema.lienWaivers.id, input.waiverId), with: { release: true } });
    if (!w) throw new Error("waiver not found");
    if (w.status !== "sent" && w.status !== "drafted") throw new Error(`waiver is ${w.status}`);
    const fields = w.fields as WaiverFields;
    const at = now();
    const hash = sha256Hex(`${w.id}|${JSON.stringify(fields)}|${input.signerName}|${at.toISOString()}`);
    await tx
      .update(schema.lienWaivers)
      .set({ status: "signed", signerUserId: input.actor.userId, signerName: input.signerName, signerTitle: input.signerTitle, signedAt: at, signatureHash: hash })
      .where(eq(schema.lienWaivers.id, w.id));
    await emit(tx, {
      aggregateType: "release",
      aggregateId: w.releaseId,
      type: "waiver.signed",
      actor: input.actor,
      payload: { waiverId: w.id, form: w.form, amountCents: fields.amountCents, hash },
      correlationId: w.release.eventId,
    });
    const conditional = w.form === "cp_8132" || w.form === "cf_8136";
    if (conditional && w.release.status === "awaiting_waiver") {
      if (fields.amountCents !== w.release.releaseCents) throw new Error("waiver amount does not match the release");
      await tx.update(schema.releases).set({ status: "waiver_signed" }).where(eq(schema.releases.id, w.releaseId));
      return { releaseId: w.releaseId, initiate: true, hash, upstreamReleaseId: null as string | null };
    }
    if (!conditional && w.release.status === "paid") {
      await tx.update(schema.releases).set({ status: "settled" }).where(eq(schema.releases.id, w.releaseId));
      await emit(tx, { aggregateType: "release", aggregateId: w.releaseId, type: "release.settled", actor: SYSTEM, payload: { waiverId: w.id }, correlationId: w.release.eventId });
    }
    return { releaseId: w.releaseId, initiate: false, hash, upstreamReleaseId: null as string | null };
  });
  if (result.initiate) {
    const state = await advanceRelease(result.releaseId);
    // A lower-tier signature may be the last thing the upstream release was waiting for.
    if (state.upstreamReleaseId) await advanceRelease(state.upstreamReleaseId);
  }
  return result;
}

export type AdvanceResult = { initiated: boolean; waitingOn: "status" | "upstream_payment" | "lower_tier_waivers" | null; upstreamReleaseId: string | null };

/**
 * Send a cleared release to the rail if nothing else gates it. Two gates beyond the claimant's own
 * waiver: a lower-tier release waits until its payer has actually been paid, and a release under a
 * contract that requires lower-tier waivers waits until every lower-tier claimant it funds has signed.
 */
export async function advanceRelease(releaseId: string): Promise<AdvanceResult> {
  const db = await getDb();
  const release = await db.query.releases.findFirst({
    where: eq(schema.releases.id, releaseId),
    with: { event: { with: { parentRelease: true } }, contract: true, downstream: { with: { releases: true } } },
  });
  if (!release) throw new Error("release not found");
  const upstreamReleaseId = release.event.parentReleaseId;
  if (release.status !== "waiver_signed") return { initiated: false, waitingOn: "status", upstreamReleaseId };
  const upstream = release.event.parentRelease;
  if (upstream && upstream.status !== "paid" && upstream.status !== "settled") return { initiated: false, waitingOn: "upstream_payment", upstreamReleaseId };
  if (await lowerTierRequired(release.contract.activeRuleSetId)) {
    const pending = release.downstream.flatMap((e) => e.releases).filter((r) => r.releaseCents > 0 && !CLEARED.includes(r.status));
    if (pending.length) return { initiated: false, waitingOn: "lower_tier_waivers", upstreamReleaseId };
  }
  await initiatePayment(releaseId);
  return { initiated: true, waitingOn: null, upstreamReleaseId };
}

async function lowerTierRequired(ruleSetId: string | null): Promise<boolean> {
  if (!ruleSetId) return false;
  const db = await getDb();
  const rs = await db.query.ruleSets.findFirst({ where: eq(schema.ruleSets.id, ruleSetId) });
  return rs ? effectiveValues(rs.rules as StoredRules).waivers.lower_tier_required === true : false;
}

/** waiver_signed → create bill → hold → release on the rail → payment_initiated. */
export async function initiatePayment(releaseId: string) {
  const db = await getDb();
  const rail = await getRail();
  const release = await db.query.releases.findFirst({
    where: eq(schema.releases.id, releaseId),
    with: { contract: { with: { sub: true } }, waivers: true, event: true },
  });
  if (!release) throw new Error("release not found");
  if (release.status !== "waiver_signed") throw new Error(`release is ${release.status}, not waiver_signed`);
  const signed = release.waivers.find((w) => w.status === "signed" && (w.form === "cp_8132" || w.form === "cf_8136"));
  if (!signed || (signed.fields as WaiverFields).amountCents !== release.releaseCents) throw new Error("no matching signed waiver");

  // One payment row per release. A failed attempt is reused, so a retry never creates a second payment.
  const prior = await db.query.payments.findFirst({ where: eq(schema.payments.releaseId, releaseId) });
  if (prior && prior.status !== "failed") throw new Error(`a payment for this release is already ${prior.status}`);
  const paymentId = prior?.id ?? randomUUID();
  if (prior) {
    const claimed = await db.update(schema.payments).set({ rail: rail.name, status: "created", externalBillId: null, updatedAt: now() }).where(and(eq(schema.payments.id, paymentId), eq(schema.payments.status, "failed"))).returning({ id: schema.payments.id });
    if (!claimed.length) throw new Error("this payment is already being sent again");
  } else await db.insert(schema.payments).values({ id: paymentId, releaseId, rail: rail.name, status: "created", amountCents: release.releaseCents });
  let bill: { externalBillId: string };
  try {
    bill = await rail.createBill({
      releaseId,
      amountCents: release.releaseCents,
      subOrgId: release.contract.subOrgId,
      vendorName: release.contract.sub.name,
      invoiceNumber: releaseId,
      memo: `Pay app release · ${release.contract.trade} · owner payment ${release.event.reference}`,
      payByDate: (release.payByAt ?? now()).toISOString().slice(0, 10),
    });
    await db.update(schema.payments).set({ externalBillId: bill.externalBillId, raw: { created: bill } }).where(eq(schema.payments.id, paymentId));
    if (rail.hold) {
      await rail.hold(bill.externalBillId);
      await db.update(schema.payments).set({ status: "held", updatedAt: now() }).where(eq(schema.payments.id, paymentId));
    }
    if (rail.release) await rail.release(bill.externalBillId);
  } catch (e) {
    await db.update(schema.payments).set({ status: "failed", raw: { error: String(e) } }).where(eq(schema.payments.id, paymentId));
    await db.update(schema.releases).set({ status: "blocked" }).where(eq(schema.releases.id, releaseId));
    throw e;
  }
  await db.transaction(async (tx) => {
    await tx.update(schema.payments).set({ status: "released", updatedAt: now() }).where(eq(schema.payments.id, paymentId));
    await tx.update(schema.releases).set({ status: "payment_initiated" }).where(eq(schema.releases.id, releaseId));
    await emit(tx, {
      aggregateType: "release",
      aggregateId: releaseId,
      type: "payment.initiated",
      actor: SYSTEM,
      payload: { paymentId, rail: rail.name, externalBillId: bill.externalBillId, amountCents: release.releaseCents },
      correlationId: release.eventId,
    });
  });
  return { paymentId, externalBillId: bill.externalBillId, rail: rail.name };
}

/**
 * A release is blocked when the rail refused or failed its payment. Retrying puts it back in the
 * queue and sends it again; the gates (upstream paid, lower-tier waivers) still apply.
 */
export async function retryRelease(input: { releaseId: string; actor: Actor }): Promise<AdvanceResult> {
  const db = await getDb();
  await db.transaction(async (tx) => {
    const release = await tx.query.releases.findFirst({ where: eq(schema.releases.id, input.releaseId), with: { waivers: true, payment: true } });
    if (!release) throw new Error("release not found");
    if (release.status !== "blocked") throw new Error(`release is ${release.status}, not blocked`);
    if (!release.payment || release.payment.status !== "failed") throw new Error("this release has no failed payment to retry");
    if (!release.waivers.some((w) => w.status === "signed" && w.form.startsWith("c"))) throw new Error("the conditional waiver is not signed");
    await tx.update(schema.releases).set({ status: "waiver_signed" }).where(eq(schema.releases.id, release.id));
    await emit(tx, { aggregateType: "release", aggregateId: release.id, type: "payment.retried", actor: input.actor, payload: { paymentId: release.payment.id }, correlationId: release.eventId });
  });
  return advanceRelease(input.releaseId);
}

/**
 * Advance every release that has cleared its waiver and is only waiting on something that may since
 * have happened. Safe to run at any time; each release is attempted on its own.
 */
export async function sweepReadyReleases(): Promise<{ advanced: string[]; failed: { releaseId: string; error: string }[] }> {
  const db = await getDb();
  const ready = await db.query.releases.findMany({ where: eq(schema.releases.status, "waiver_signed") });
  const advanced: string[] = [];
  const failed: { releaseId: string; error: string }[] = [];
  for (const r of ready) {
    try {
      if ((await advanceRelease(r.id)).initiated) advanced.push(r.id);
    } catch (e) {
      failed.push({ releaseId: r.id, error: (e as Error).message });
    }
  }
  return { advanced, failed };
}

/** Idempotent webhook processing: inbox row first, then settle the payment and its release. */
export async function handleRailWebhook(railNameIn: string, event: RailWebhookEvent) {
  const db = await getDb();
  const result = await settleInTx(railNameIn, event);
  // The payee now has its money: start the lower-tier clocks from the real receipt and pay anyone who has signed.
  if (result.paidReleaseId) {
    const downstream = await db.query.ownerPaymentEvents.findMany({ where: eq(schema.ownerPaymentEvents.parentReleaseId, result.paidReleaseId), with: { releases: true } });
    const at = now();
    for (const e of downstream) {
      // The event recorded an estimate of when the payer would have the money; now it is known.
      await db.update(schema.ownerPaymentEvents).set({ receivedAt: at }).where(eq(schema.ownerPaymentEvents.id, e.id));
      for (const r of e.releases) {
        if (r.payByAt && ["awaiting_waiver", "waiver_signed"].includes(r.status)) {
          await db.update(schema.releases).set({ payByAt: new Date(at.getTime() + (r.payByAt.getTime() - e.receivedAt.getTime())) }).where(eq(schema.releases.id, r.id));
        }
      }
    }
    // One lower-tier payment failing on the rail must not stop its siblings; the sweep can be re-run.
    await sweepReadyReleases();
  }
  return result;
}

async function settleInTx(railNameIn: string, event: RailWebhookEvent): Promise<{ duplicate: boolean; matched?: boolean; paidReleaseId?: string }> {
  const db = await getDb();
  return db.transaction(async (tx) => {
    const inserted = await tx
      .insert(schema.webhookInbox)
      .values({ id: randomUUID(), rail: railNameIn, externalEventId: event.externalEventId, payload: event.raw as object })
      .onConflictDoNothing()
      .returning({ id: schema.webhookInbox.id });
    if (!inserted.length) return { duplicate: true };
    const payment = await tx.query.payments.findFirst({
      where: and(eq(schema.payments.rail, railNameIn), eq(schema.payments.externalBillId, event.externalBillId)),
      with: { release: { with: { contract: { with: { sub: true } }, waivers: true } } },
    });
    if (!payment) {
      await tx.update(schema.webhookInbox).set({ processedAt: now(), error: "no matching payment" }).where(eq(schema.webhookInbox.id, inserted[0].id));
      return { duplicate: false, matched: false };
    }
    const release = payment.release;
    if (event.type === "bill.failed" && payment.status === "paid") {
      // A late or out-of-order failure notice for money that has already settled changes nothing.
      await tx.update(schema.webhookInbox).set({ processedAt: now(), error: "failure reported after settlement; ignored" }).where(eq(schema.webhookInbox.id, inserted[0].id));
      return { duplicate: false, matched: true };
    }
    if (event.type === "bill.failed") {
      await tx.update(schema.payments).set({ status: "failed", updatedAt: now(), raw: event.raw as object }).where(eq(schema.payments.id, payment.id));
      await tx.update(schema.releases).set({ status: "blocked" }).where(eq(schema.releases.id, release.id));
      await emit(tx, { aggregateType: "release", aggregateId: release.id, type: "payment.failed", actor: SYSTEM, payload: { paymentId: payment.id }, correlationId: release.eventId });
    } else if (payment.status !== "paid") {
      await tx.update(schema.payments).set({ status: "paid", updatedAt: now(), raw: event.raw as object }).where(eq(schema.payments.id, payment.id));
      await tx.update(schema.releases).set({ status: "paid" }).where(eq(schema.releases.id, release.id));
      const conditional = release.waivers.find((w) => w.status === "signed");
      if (conditional) {
        const f = conditional.fields as WaiverFields;
        await tx.insert(schema.lienWaivers).values({
          id: randomUUID(),
          releaseId: release.id,
          contractId: release.contractId,
          form: unconditionalCounterpart(conditional.form),
          status: "sent",
          fields: { ...f, form: unconditionalCounterpart(conditional.form) },
          supersedesId: conditional.id,
          signToken: conditional.signToken ? newSignToken() : null,
        });
      }
      const ev = await emit(tx, {
        aggregateType: "release",
        aggregateId: release.id,
        type: "payment.paid",
        actor: SYSTEM,
        payload: { paymentId: payment.id, amountCents: payment.amountCents, rail: railNameIn },
        correlationId: release.eventId,
      });
      const base = { projectId: release.contract.projectId, eventId: ev, correlationId: release.eventId };
      const name = release.contract.sub.name;
      if (release.contract.parentContractId) {
        await post(tx, [
          { ...base, contractId: release.contractId, account: "lower_tier_payable", deltaCents: -payment.amountCents, memo: `Paid ${name}` },
          { ...base, contractId: release.contractId, account: "lower_tier_paid", deltaCents: payment.amountCents, memo: `Paid ${name}` },
        ]);
      } else {
        await post(tx, [
          { ...base, contractId: release.contractId, account: "sub_payable", deltaCents: -payment.amountCents, memo: `Paid ${name}` },
          { ...base, contractId: release.contractId, account: "sub_paid", deltaCents: payment.amountCents, memo: `Paid ${name}` },
          { ...base, contractId: null, account: "gc_cash", deltaCents: -payment.amountCents, memo: `Paid ${name} via ${railNameIn}` },
        ]);
      }
      await tx.update(schema.webhookInbox).set({ processedAt: now() }).where(eq(schema.webhookInbox.id, inserted[0].id));
      return { duplicate: false, matched: true, paidReleaseId: release.id };
    }
    await tx.update(schema.webhookInbox).set({ processedAt: now() }).where(eq(schema.webhookInbox.id, inserted[0].id));
    return { duplicate: false, matched: true };
  });
}

/** Demo: "Settle at bank" for the simulated rail posts a synthetic bill.paid through the same path. */
export async function settleSimulated(paymentId: string) {
  const db = await getDb();
  const p = await db.query.payments.findFirst({ where: eq(schema.payments.id, paymentId) });
  if (!p) throw new Error("payment not found");
  if (p.rail !== "simulated") throw new Error("only simulated payments can be settled by hand");
  return handleRailWebhook("simulated", { externalEventId: `sim-evt-${paymentId}`, type: "bill.paid", externalBillId: p.externalBillId!, raw: { simulated: true, paymentId } });
}

export { railName };
