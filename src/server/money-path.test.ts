/** Money-path guards on the in-memory database: duplicate owner payments, stale schedule lines, rule overrides, waiver before payment. */
import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { ID } from "@/db/seed";
import { resetTo } from "@/server/demo/reset";
import { recordOwnerPayment } from "@/server/actions/owner-payment";
import { reviewPayApp, submitPayApp } from "@/server/actions/pay-apps";
import { advanceRelease, initiatePayment, settleSimulated, signWaiver } from "@/server/actions/payments";
import { acknowledgeAnomaly, approveRuleSet, createRuleSet, resolveField } from "@/server/actions/rules";
import type { StoredRules } from "@/server/rules/review";
import { replayProject } from "@/server/engine/replay";
import { isCalendarDate } from "@/server/clock";
import { stableId } from "@/lib/ids";
import { dollars } from "@/lib/money";

const GC = { userId: ID.user.priya, label: "Priya Natarajan" };
const ROSA = { userId: ID.user.rosa, label: "Rosa Delgado" };
const sov = (n: number) => stableId(`sov:${ID.contract.ironline}:${n}`);

describe("recording an owner payment", () => {
  beforeAll(async () => {
    await resetTo("paid2");
  }, 60_000);

  it("the same bank reference and amount is recorded once, even when the time received differs", async () => {
    // The form defaults the time received to "now", so a second submit carries a different time.
    const db = await getDb();
    const count = async () => ({ events: (await db.select().from(schema.ownerPaymentEvents)).length, releases: (await db.select().from(schema.releases)).length, ledger: (await db.select().from(schema.ledgerEntries)).length });
    const input = { projectId: ID.project.bayview, amountCents: dollars(125_000), periodThrough: "2026-10-31", reference: "ACH BVH-0170", actor: GC };
    const first = await recordOwnerPayment({ ...input, receivedAt: new Date("2026-11-12T17:00:00.000Z") });
    expect(first.duplicate).toBe(false);
    const before = await count();
    const second = await recordOwnerPayment({ ...input, receivedAt: new Date("2026-11-12T17:00:03.250Z") });
    expect(second).toMatchObject({ duplicate: true, eventId: first.eventId });
    expect(await count()).toEqual(before);
  });

  it("a different reference, or the same reference on another project, is a new payment", async () => {
    const other = await recordOwnerPayment({ projectId: ID.project.bayview, amountCents: dollars(125_000), receivedAt: new Date("2026-11-13T17:00:00Z"), periodThrough: "2026-10-31", reference: "ACH BVH-0171", actor: GC });
    expect(other.duplicate).toBe(false);
    const elsewhere = await recordOwnerPayment({ projectId: ID.project.congress, amountCents: dollars(125_000), receivedAt: new Date("2026-11-13T17:00:00Z"), periodThrough: "2026-10-31", reference: "ACH BVH-0170", actor: GC });
    expect(elsewhere.duplicate).toBe(false);
  });

  it("refuses an amount that is not a positive whole number of cents, and a period that is not a calendar date, before anything is written", async () => {
    const db = await getDb();
    const events = async () => (await db.select().from(schema.ownerPaymentEvents)).length;
    const before = await events();
    const base = { projectId: ID.project.bayview, receivedAt: new Date("2026-11-14T17:00:00Z"), periodThrough: "2026-10-31", reference: "BAD-1", actor: GC };
    for (const amountCents of [0, -dollars(5), 100.5, Number.NaN, Number.POSITIVE_INFINITY]) await expect(recordOwnerPayment({ ...base, amountCents }), String(amountCents)).rejects.toThrow(/amount/);
    await expect(recordOwnerPayment({ ...base, amountCents: dollars(5), retentionCents: 0.5 })).rejects.toThrow(/retention/);
    for (const periodThrough of ["2026-13-45", "2026-02-30", "10/31/2026", ""]) await expect(recordOwnerPayment({ ...base, amountCents: dollars(5), periodThrough }), periodThrough).rejects.toThrow(/calendar date/);
    await expect(recordOwnerPayment({ ...base, amountCents: dollars(5), receivedAt: new Date("nope") })).rejects.toThrow(/time received/);
    expect(await events()).toBe(before);
  });

  it("refuses a retention portion larger than the payment", async () => {
    await expect(recordOwnerPayment({ projectId: ID.project.bayview, amountCents: dollars(10), retentionCents: dollars(11), receivedAt: new Date("2026-11-14T17:00:00Z"), periodThrough: "2026-10-31", reference: "RET-BAD", actor: GC })).rejects.toThrow(/retention portion/);
  });
});

describe("calendar dates", () => {
  it("accepts real ISO dates only", () => {
    for (const ok of ["2026-10-31", "2028-02-29", "2026-01-01"]) expect(isCalendarDate(ok), ok).toBe(true);
    for (const bad of ["2026-02-29", "2026-13-01", "2026-00-10", "2026-4-1", "2026-10-31T00:00", " 2026-10-31", ""]) expect(isCalendarDate(bad), bad).toBe(false);
  });
});

describe("approving a pay application", () => {
  beforeAll(async () => {
    await resetTo("paid1");
  }, 60_000);

  it("re-checks each line against what has been approved since it was submitted, so two pending applications cannot overbill a line together", async () => {
    // "Structural steel — furnish" is $150,000 and $50,000 is already billed. Two applications are
    // submitted before either is reviewed; each fits alone, together they bill $170,000.
    const a2 = await submitPayApp({ contractId: ID.contract.ironline, number: 2, periodThrough: "2026-10-31", lines: [{ sovLineId: sov(3), thisPeriodCents: dollars(60_000), storedCents: 0 }], retainageBilledCents: dollars(6_000), previouslyBilledCents: dollars(100_000), actor: ROSA });
    const a3 = await submitPayApp({ contractId: ID.contract.ironline, number: 3, periodThrough: "2026-11-30", lines: [{ sovLineId: sov(3), thisPeriodCents: dollars(60_000), storedCents: 0 }], retainageBilledCents: dollars(6_000), previouslyBilledCents: dollars(160_000), actor: ROSA });
    await reviewPayApp({ payAppId: a2.id, decision: "approve", actor: GC });
    await expect(reviewPayApp({ payAppId: a3.id, decision: "approve", actor: GC })).rejects.toThrow(/sov_overbilling/);
    const db = await getDb();
    expect((await db.query.payApplications.findFirst({ where: eq(schema.payApplications.id, a3.id) }))!.status).toBe("submitted");
  });

  it("refuses a period that is not a calendar date", async () => {
    await expect(submitPayApp({ contractId: ID.contract.ironline, number: 9, periodThrough: "2026-02-31", lines: [{ sovLineId: sov(4), thisPeriodCents: dollars(1), storedCents: 0 }], retainageBilledCents: 10, previouslyBilledCents: 0, actor: ROSA })).rejects.toThrow(/calendar date/);
  });

  it("cannot be decided twice", async () => {
    const app = (await (await getDb()).query.payApplications.findFirst({ where: eq(schema.payApplications.id, stableId("payapp:ironline:1")) }))!;
    await expect(reviewPayApp({ payAppId: app.id, decision: "approve", actor: GC })).rejects.toThrow(/already been decided/);
    await expect(reviewPayApp({ payAppId: app.id, decision: "request_changes", actor: GC })).rejects.toThrow(/already been decided/);
  });
});

describe("overriding a payment term", () => {
  let ruleSetId = "";

  beforeAll(async () => {
    await resetTo("paid1");
    const db = await getDb();
    const row = (await db.query.ruleSets.findFirst({ where: eq(schema.ruleSets.id, stableId("ruleset:ironline:1")) }))!;
    ruleSetId = stableId("ruleset:ironline:override-test");
    await db.insert(schema.ruleSets).values({ ...row, id: ruleSetId, version: 2, status: "in_review", approvedAt: null, approvedBy: null, approvedHash: null });
  }, 60_000);

  const override = (path: Parameters<typeof resolveField>[0]["path"], value: unknown) => resolveField({ ruleSetId, path, decision: "override", value, note: "Test.", actor: GC });

  it("refuses a retainage rate that is not a whole number of basis points between 0% and 20%", async () => {
    // A negative rate would pay a subcontractor more than the gross funded; NaN is stored as null and withholds nothing.
    for (const bad of [-500, Number.NaN, 50_000, 2_001, 12.5, "500", null]) {
      await expect(override("retainage.percent_bps", bad), String(bad)).rejects.toThrow(/between 0% and 20%/);
      await expect(override("retainage.cap_bps", bad), String(bad)).rejects.toThrow(/between 0% and 20%/);
    }
  });

  it("refuses day counts that are negative, fractional or not numbers", async () => {
    for (const bad of [-1, 1.5, Number.NaN, 121, "7"]) await expect(override("timing.days", bad), String(bad)).rejects.toThrow(/whole number of days/);
    for (const bad of [-1, 0.5, Number.NaN, 366]) await expect(override("retainage.release_days", bad), String(bad)).rejects.toThrow(/whole number of days/);
  });

  it("refuses a timing type, a yes/no term or a state that is not one of the allowed values", async () => {
    await expect(override("timing.type", "whenever")).rejects.toThrow(/payment timing/);
    await expect(override("offsets.backcharge_setoff", "yes")).rejects.toThrow(/yes or no/);
    await expect(override("governing_law_state", "California")).rejects.toThrow(/two-letter/);
  });

  it("refuses to acknowledge a note that does not exist", async () => {
    for (const bad of [-1, 1.5, Number.NaN, 999]) await expect(acknowledgeAnomaly({ ruleSetId, index: bad, note: "Test.", actor: GC }), String(bad)).rejects.toThrow(/no such note/);
    const db = await getDb();
    const acks = ((await db.query.ruleSets.findFirst({ where: eq(schema.ruleSets.id, ruleSetId) }))!.rules as { anomalyAcks: Record<string, unknown> }).anomalyAcks;
    expect(Object.keys(acks)).toEqual([]);
  });

  it("nothing is stored when an override is refused, and valid overrides still go through to approval", async () => {
    const db = await getDb();
    const stored = async () => ((await db.query.ruleSets.findFirst({ where: eq(schema.ruleSets.id, ruleSetId) }))!.rules as { annotations: Record<string, { review: { override: { value: unknown } | null } }> }).annotations;
    expect((await stored())["retainage.percent_bps"].review.override).toBeNull();
    await override("retainage.percent_bps", 500);
    await override("retainage.cap_bps", 0);
    await override("timing.days", 0);
    await override("retainage.release_days", 365);
    await override("timing.type", "fixed_days");
    await override("offsets.backcharge_setoff", false);
    await override("governing_law_state", "TX");
    await override("retainage.release_condition", "On final completion.");
    const a = await stored();
    expect(a["retainage.percent_bps"].review.override?.value).toBe(500);
    expect(a["governing_law_state"].review.override?.value).toBe("TX");
    await approveRuleSet({ ruleSetId, actor: GC });
  });
});

describe("a release is paid only after its conditional waiver is signed", () => {
  beforeAll(async () => {
    await resetTo("paid2");
  }, 60_000);

  it("an unsigned release cannot be sent to the rail or settled; signing sends exactly the waived amount", async () => {
    const db = await getDb();
    const rel = (await db.query.releases.findFirst({ where: eq(schema.releases.contractId, ID.contract.ironline), with: { waivers: true }, orderBy: (r, { desc }) => [desc(r.createdAt)] }))!;
    expect(rel.status).toBe("awaiting_waiver");
    await expect(initiatePayment(rel.id)).rejects.toThrow(/not waiver_signed/);
    expect(await advanceRelease(rel.id)).toMatchObject({ initiated: false, waitingOn: "status" });
    expect(await db.query.payments.findFirst({ where: eq(schema.payments.releaseId, rel.id) })).toBeUndefined();

    // A waiver whose amount no longer matches the release is refused, and the release stays unpaid.
    const waiver = rel.waivers[0];
    await db.update(schema.lienWaivers).set({ fields: { ...(waiver.fields as object), amountCents: rel.releaseCents + 1 } }).where(eq(schema.lienWaivers.id, waiver.id));
    await expect(signWaiver({ waiverId: waiver.id, signerName: "Rosa Delgado", signerTitle: "Office Manager", actor: ROSA })).rejects.toThrow(/does not match/);
    expect((await db.query.lienWaivers.findFirst({ where: eq(schema.lienWaivers.id, waiver.id) }))!.status).toBe("sent");
    await db.update(schema.lienWaivers).set({ fields: waiver.fields }).where(eq(schema.lienWaivers.id, waiver.id));

    await signWaiver({ waiverId: waiver.id, signerName: "Rosa Delgado", signerTitle: "Office Manager", actor: ROSA });
    const payment = (await db.query.payments.findFirst({ where: eq(schema.payments.releaseId, rel.id) }))!;
    expect(payment.amountCents).toBe(rel.releaseCents);
    // Signed once: the same waiver cannot be signed again, and the release cannot be sent twice.
    await expect(signWaiver({ waiverId: waiver.id, signerName: "Rosa Delgado", signerTitle: "Office Manager", actor: ROSA })).rejects.toThrow(/waiver is signed/);
    await expect(initiatePayment(rel.id)).rejects.toThrow(/not waiver_signed/);
    // Settling twice posts the ledger once.
    const first = await settleSimulated(payment.id);
    const again = await settleSimulated(payment.id);
    expect(first).toMatchObject({ duplicate: false, matched: true });
    expect(again).toMatchObject({ duplicate: true });
    const paid = await db.query.ledgerEntries.findMany({ where: eq(schema.ledgerEntries.contractId, ID.contract.ironline) });
    expect(paid.filter((e) => e.account === "sub_paid" && e.deltaCents === rel.releaseCents)).toHaveLength(1);
  });
});

describe("settling by hand", () => {
  beforeAll(async () => {
    await resetTo("paid2");
  }, 60_000);

  it("a payment that never reached the rail cannot be settled, and the attempt does not use up its settlement event", async () => {
    const db = await getDb();
    const rel = (await db.query.releases.findFirst({ where: eq(schema.releases.contractId, ID.contract.summit), orderBy: (r, { desc }) => [desc(r.createdAt)] }))!;
    const paymentId = stableId("payment:never-sent");
    await db.insert(schema.payments).values({ id: paymentId, releaseId: rel.id, rail: "simulated", status: "failed", amountCents: rel.releaseCents });
    await expect(settleSimulated(paymentId)).rejects.toThrow(/has not been sent/);
    expect(await db.query.webhookInbox.findFirst({ where: eq(schema.webhookInbox.externalEventId, `sim-evt-${paymentId}`) })).toBeUndefined();
    expect((await db.query.releases.findFirst({ where: eq(schema.releases.id, rel.id) }))!.status).toBe("awaiting_waiver");
  });
});

describe("a subcontract read again after its rules were approved", () => {
  beforeAll(async () => {
    await resetTo("paid2");
    // POST /api/extract on an approved subcontract proposes version 2 and puts the contract back "in review";
    // version 1 stays the approved, active rule set until version 2 is approved.
    const db = await getDb();
    const v1 = (await db.query.ruleSets.findFirst({ where: eq(schema.ruleSets.id, stableId("ruleset:ironline:1")) }))!;
    const contract = (await db.query.contracts.findFirst({ where: eq(schema.contracts.id, ID.contract.ironline), with: { document: true } }))!;
    await createRuleSet({ contractId: ID.contract.ironline, extracted: (v1.rules as StoredRules).extracted, pageTexts: contract.document?.pageTexts ?? [], model: "test", promptVersion: "test", extractionMs: 0, actor: GC });
    const after = (await db.query.contracts.findFirst({ where: eq(schema.contracts.id, ID.contract.ironline) }))!;
    expect(after).toMatchObject({ status: "in_review", activeRuleSetId: v1.id });
  }, 60_000);

  it("replay still reproduces every stored release", async () => {
    expect((await replayProject(ID.project.bayview)).mismatches).toEqual([]);
  });

  it("the next owner payment still funds its approved pay application under the approved rules", async () => {
    // $125,000 is outstanding across the three subcontractors; Ironline is owed $50,000 of it.
    const r = await recordOwnerPayment({ projectId: ID.project.bayview, amountCents: dollars(125_000), receivedAt: new Date("2026-11-20T17:00:00Z"), periodThrough: "2026-10-31", reference: "ACH BVH-0175", actor: GC });
    expect(r.plan.unallocatedCents).toBe(0);
    expect(r.plan.releases.find((x) => x.contractId === ID.contract.ironline)).toMatchObject({ grossCents: dollars(50_000), retainageWithheldCents: dollars(5_000), releaseCents: dollars(45_000), awaitingOwnerCents: 0 });
    expect((await replayProject(ID.project.bayview)).mismatches).toEqual([]);
  });
});
