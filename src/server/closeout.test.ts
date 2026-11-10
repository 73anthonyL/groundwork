/** End-to-end on the in-memory database: backcharge, change order, lower tier, retention release, replay. */
import { beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { ID } from "@/db/seed";
import { resetTo } from "@/server/demo/reset";
import { recordOwnerPayment } from "@/server/actions/owner-payment";
import { reviewPayApp, submitPayApp } from "@/server/actions/pay-apps";
import { advanceRelease, settleSimulated, signWaiver } from "@/server/actions/payments";
import { certifyRetention, decideChangeOrder, proposeChangeOrder, recordBackcharge, retentionPosition, voidBackcharge } from "@/server/actions/adjustments";
import { addLowerTierParty, listLowerTier } from "@/server/actions/lower-tier";
import { replayProject } from "@/server/engine/replay";
import { stableId } from "@/lib/ids";
import { dollars } from "@/lib/money";

const GC = { userId: ID.user.priya, label: "Priya Natarajan" };
const ROSA = { userId: ID.user.rosa, label: "Rosa Delgado" };
const SUPPLIER = { userId: null, label: "Bay Rebar Supply" };

async function balances() {
  const db = await getDb();
  const rows = await db
    .select({ account: schema.ledgerEntries.account, total: sql<number>`sum(${schema.ledgerEntries.deltaCents})::bigint` })
    .from(schema.ledgerEntries)
    .groupBy(schema.ledgerEntries.account);
  return Object.fromEntries(rows.map((r) => [r.account, Number(r.total)]));
}

async function releasesOf(eventId: string) {
  const db = await getDb();
  const rel = await db.query.releases.findMany({ where: eq(schema.releases.eventId, eventId), with: { contract: { with: { sub: true } }, waivers: true, payment: true } });
  return Object.fromEntries(rel.map((r) => [`${r.contract.sub.slug}:${r.kind}:${r.payApplicationId ? "app" : "cert"}`, r]));
}

describe("closeout: adjustments and the lower tier", () => {
  let rebarContractId = "";
  let op3 = "";

  beforeAll(async () => {
    await resetTo("paid2");
  }, 60_000);

  it("a backcharge needs a setoff clause, a reason and a positive amount; it can be withdrawn before it is recovered", async () => {
    await expect(recordBackcharge({ contractId: ID.contract.summit, amountCents: 0, reason: "x", actor: GC })).rejects.toThrow();
    const b = await recordBackcharge({ contractId: ID.contract.pacific, amountCents: dollars(900), reason: "Patch fire caulk at panel EP-2", actor: GC });
    await voidBackcharge({ backchargeId: b.id, actor: GC });
    await recordBackcharge({ contractId: ID.contract.summit, amountCents: dollars(1_500), reason: "Cleanup of drywall debris, level 2, after 5 business days' notice", noticeDate: "2026-10-20", actor: GC });
  });

  it("an approved change order raises the contract sum and adds a schedule-of-values line; a deductive one cannot cut below billed", async () => {
    const co = await proposeChangeOrder({ contractId: ID.contract.ironline, title: "Added roof screen framing", amountCents: dollars(20_000), actor: ROSA });
    expect(co.number).toBe(1);
    const r = await decideChangeOrder({ changeOrderId: co.id, decision: "approve", actor: GC });
    expect(r.contractSumCents).toBe(dollars(420_000));
    const db = await getDb();
    const lines = await db.query.sovLines.findMany({ where: eq(schema.sovLines.contractId, ID.contract.ironline) });
    expect(lines).toHaveLength(7);
    expect(lines.reduce((s, l) => s + l.scheduledValueCents, 0)).toBe(dollars(420_000));
    // Line 1 (mobilization, $20,000) is fully billed; it cannot be reduced.
    const cut = await proposeChangeOrder({ contractId: ID.contract.ironline, title: "Credit mobilization", amountCents: -dollars(5_000), sovLineId: stableId(`sov:${ID.contract.ironline}:1`), actor: GC });
    await expect(decideChangeOrder({ changeOrderId: cut.id, decision: "approve", actor: GC })).rejects.toThrow(/already billed/);
    await decideChangeOrder({ changeOrderId: cut.id, decision: "reject", note: "Line is fully billed.", actor: GC });
  });

  it("a lower-tier supplier is declared on the sub's pay application and becomes an approved application one hop down", async () => {
    const party = await addLowerTierParty({ parentContractId: ID.contract.ironline, name: "Bay Rebar Supply", kind: "supplier", scope: "Reinforcing steel", sumCents: dollars(60_000), actor: ROSA });
    rebarContractId = party.id;
    const db = await getDb();
    const co = await db.query.sovLines.findFirst({ where: eq(schema.sovLines.description, "CO-1: Added roof screen framing") });
    await expect(
      submitPayApp({ contractId: ID.contract.ironline, number: 3, periodThrough: "2026-11-30", lines: [{ sovLineId: co!.id, thisPeriodCents: dollars(1_000), storedCents: 0 }], retainageBilledCents: dollars(100), previouslyBilledCents: dollars(200_000), lowerTier: [{ contractId: rebarContractId, amountCents: dollars(5_000) }], actor: ROSA }),
    ).rejects.toThrow(/cannot exceed/);
    const app = await submitPayApp({
      id: stableId("payapp:ironline:3"),
      contractId: ID.contract.ironline,
      number: 3,
      periodThrough: "2026-11-30",
      lines: [
        { sovLineId: co!.id, thisPeriodCents: dollars(20_000), storedCents: 0 },
        { sovLineId: stableId(`sov:${ID.contract.ironline}:5`), thisPeriodCents: dollars(30_000), storedCents: 0 },
      ],
      retainageBilledCents: dollars(5_000),
      previouslyBilledCents: dollars(200_000),
      lowerTier: [{ contractId: rebarContractId, amountCents: dollars(12_000) }],
      actor: ROSA,
    });
    expect(app.blocking).toBe(false);
    await reviewPayApp({ payAppId: app.id, decision: "approve", actor: GC });
    const [child] = await listLowerTier(db, ID.contract.ironline);
    expect(child.payApplications).toHaveLength(1);
    expect(child.payApplications[0]).toMatchObject({ status: "approved", workThisPeriodCents: dollars(12_000), parentPayApplicationId: app.id });
  });

  it("the next owner payment sets off the backcharge and plans the lower-tier hop in the same transaction", async () => {
    const r = await recordOwnerPayment({ id: stableId("owner-payment:3"), projectId: ID.project.bayview, amountCents: dollars(175_000), receivedAt: new Date("2026-12-10T17:00:00Z"), periodThrough: "2026-11-30", reference: "ACH BVH-0188", actor: GC });
    op3 = r.eventId;
    expect(r.plan.unallocatedCents).toBe(0);
    const db = await getDb();
    const summit = (await db.query.releases.findMany({ where: eq(schema.releases.eventId, op3), with: { contract: { with: { sub: true } } } })).find((x) => x.contract.sub.slug === "summit-drywall")!;
    // $25,000 gross − $2,500 retainage (10%) − $1,500 backcharge.
    expect(summit).toMatchObject({ grossCents: dollars(25_000), retainageWithheldCents: dollars(2_500), offsetCents: dollars(1_500), releaseCents: dollars(21_000) });
    const down = await db.query.ownerPaymentEvents.findMany({ where: eq(schema.ownerPaymentEvents.payerContractId, ID.contract.ironline), with: { releases: { with: { waivers: true } } } });
    expect(down).toHaveLength(1);
    expect(down[0]).toMatchObject({ amountCents: dollars(12_000), source: "cascade" });
    expect(down[0].releases[0]).toMatchObject({ contractId: rebarContractId, releaseCents: dollars(12_000), status: "awaiting_waiver" });
    expect(down[0].releases[0].waivers[0].signToken).toMatch(/^[\w-]{20,}$/);
    expect((down[0].releases[0].waivers[0].fields as { claimant: string; customer: string })).toMatchObject({ claimant: "Bay Rebar Supply", customer: "Ironline Steel" });
    // The supplier's 7-day clock runs from the latest date Ironline will have been paid.
    const up = await db.query.releases.findFirst({ where: eq(schema.releases.id, down[0].parentReleaseId!) });
    expect(down[0].releases[0].payByAt!.getTime() - up!.payByAt!.getTime()).toBe(7 * 86_400_000);
  });

  it("the sub's release waits for its supplier's waiver; the supplier is paid only after the sub is", async () => {
    const db = await getDb();
    const down = (await db.query.ownerPaymentEvents.findFirst({ where: eq(schema.ownerPaymentEvents.payerContractId, ID.contract.ironline), with: { releases: { with: { waivers: true } } } }))!;
    const upId = down.parentReleaseId!;
    const up = (await db.query.releases.findFirst({ where: eq(schema.releases.id, upId), with: { waivers: true } }))!;
    await signWaiver({ waiverId: up.waivers[0].id, signerName: "Rosa Delgado", signerTitle: "Office Manager", actor: ROSA });
    expect((await advanceRelease(upId)).waitingOn).toBe("lower_tier_waivers");
    expect(await db.query.payments.findFirst({ where: eq(schema.payments.releaseId, upId) })).toBeUndefined();

    const child = down.releases[0];
    await signWaiver({ waiverId: child.waivers[0].id, signerName: "Luis Ortega", signerTitle: "Credit Manager", actor: SUPPLIER });
    // Supplier signed: the sub's payment goes out, the supplier's waits for the sub to be paid.
    const upPayment = (await db.query.payments.findFirst({ where: eq(schema.payments.releaseId, upId) }))!;
    expect(upPayment.status).toBe("released");
    expect((await advanceRelease(child.id)).waitingOn).toBe("upstream_payment");
    expect(await db.query.payments.findFirst({ where: eq(schema.payments.releaseId, child.id) })).toBeUndefined();

    await settleSimulated(upPayment.id);
    const childPayment = (await db.query.payments.findFirst({ where: eq(schema.payments.releaseId, child.id) }))!;
    expect(childPayment).toMatchObject({ status: "released", amountCents: dollars(12_000) });
    await settleSimulated(childPayment.id);
    const b = await balances();
    expect(b.lower_tier_paid).toBe(dollars(12_000));
    expect(b.lower_tier_payable).toBe(0);
    const uncond = await db.query.lienWaivers.findMany({ where: eq(schema.lienWaivers.releaseId, child.id) });
    expect(uncond.map((w) => w.form).sort()).toEqual(["cp_8132", "up_8134"]);
    expect(uncond.every((w) => w.signToken)).toBe(true);
  });

  it("certified retainage is released when the owner's retention arrives, on the shorter of the contract and statutory clocks", async () => {
    const db = await getDb();
    const before = await retentionPosition(db, ID.contract.ironline);
    expect(before.heldCents).toBe(dollars(25_000));
    const cert = await certifyRetention({ contractId: ID.contract.ironline, releaseBps: 5_000, note: "Architect certified Substantial Completion on 2026-12-12.", actor: GC });
    expect(cert.amountCents).toBe(dollars(12_500));
    expect((await retentionPosition(db, ID.contract.ironline)).certifiableCents).toBe(dollars(12_500));

    const receivedAt = new Date("2026-12-20T17:00:00Z");
    const r = await recordOwnerPayment({ id: stableId("owner-payment:4"), projectId: ID.project.bayview, amountCents: dollars(12_500), retentionCents: dollars(12_500), receivedAt, periodThrough: "2026-12-31", reference: "ACH BVH-0201", actor: GC });
    expect(r.plan.unallocatedCents).toBe(0);
    const by = await releasesOf(r.eventId);
    const rel = by["ironline-steel:retention:cert"];
    expect(rel).toMatchObject({ grossCents: 0, retainageWithheldCents: 0, releaseCents: dollars(12_500), certificationId: cert.id, status: "awaiting_waiver" });
    expect(rel.payByAt!.getTime() - receivedAt.getTime()).toBe(10 * 86_400_000);
    expect((rel.basis as { statutes: string[] }).statutes).toContain("CA_CIV_8814");
    expect((await retentionPosition(db, ID.contract.ironline)).heldCents).toBe(dollars(12_500));
    // The same certification is never released twice.
    const again = await recordOwnerPayment({ projectId: ID.project.bayview, amountCents: dollars(1), retentionCents: dollars(1), receivedAt, periodThrough: "2026-12-31", reference: "ACH BVH-0202", actor: GC });
    expect(again.plan.releases).toHaveLength(0);
  });

  it("the ledger reconciles and replay reproduces every release on both tiers", async () => {
    const b = await balances();
    // Cash on hand = owed to subs + retainage held + backcharges kept + the owner's retention money received.
    expect(b.backcharge_recovered).toBe(dollars(1_500));
    expect(b.gc_cash).toBe(b.sub_payable + b.retainage_held + b.backcharge_recovered + dollars(12_500) + dollars(1));
    const r = await replayProject(ID.project.bayview);
    expect(r.mismatches).toEqual([]);
    expect(r.events).toBe(6);
  });
});
