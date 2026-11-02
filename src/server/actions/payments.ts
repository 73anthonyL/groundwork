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
      return { releaseId: w.releaseId, initiate: true, hash };
    }
    if (!conditional && w.release.status === "paid") {
      await tx.update(schema.releases).set({ status: "settled" }).where(eq(schema.releases.id, w.releaseId));
      await emit(tx, { aggregateType: "release", aggregateId: w.releaseId, type: "release.settled", actor: SYSTEM, payload: { waiverId: w.id }, correlationId: w.release.eventId });
    }
    return { releaseId: w.releaseId, initiate: false, hash };
  });
  if (result.initiate) await initiatePayment(result.releaseId);
  return result;
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

  const paymentId = randomUUID();
  await db.insert(schema.payments).values({ id: paymentId, releaseId, rail: rail.name, status: "created", amountCents: release.releaseCents });
  const bill = await rail.createBill({
    releaseId,
    amountCents: release.releaseCents,
    vendorName: release.contract.sub.name,
    invoiceNumber: releaseId,
    memo: `Pay app release · ${release.contract.trade} · owner payment ${release.event.reference}`,
  });
  await db.update(schema.payments).set({ externalBillId: bill.externalBillId, raw: { created: bill } }).where(eq(schema.payments.id, paymentId));
  try {
    await rail.hold(bill.externalBillId);
    await db.update(schema.payments).set({ status: "held", updatedAt: now() }).where(eq(schema.payments.id, paymentId));
  } catch (e) {
    await db.update(schema.payments).set({ status: "failed", raw: { error: String(e) } }).where(eq(schema.payments.id, paymentId));
    await db.update(schema.releases).set({ status: "blocked" }).where(eq(schema.releases.id, releaseId));
    throw e;
  }
  await rail.release(bill.externalBillId);
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

/** Idempotent webhook processing: inbox row first, then settle the payment and its release. */
export async function handleRailWebhook(railNameIn: string, event: RailWebhookEvent) {
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
      const project = await tx.query.contracts.findFirst({ where: eq(schema.contracts.id, release.contractId) });
      await post(tx, [
        { projectId: project!.projectId, contractId: release.contractId, account: "sub_payable", deltaCents: -payment.amountCents, eventId: ev, correlationId: release.eventId, memo: `Paid ${release.contract.sub.name}` },
        { projectId: project!.projectId, contractId: release.contractId, account: "sub_paid", deltaCents: payment.amountCents, eventId: ev, correlationId: release.eventId, memo: `Paid ${release.contract.sub.name}` },
        { projectId: project!.projectId, contractId: null, account: "gc_cash", deltaCents: -payment.amountCents, eventId: ev, correlationId: release.eventId, memo: `Paid ${release.contract.sub.name} via ${railNameIn}` },
      ]);
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
