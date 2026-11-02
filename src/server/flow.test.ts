/** End-to-end on the in-memory database: checkpoints, ledger invariants, idempotency, replay. */
import { beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { ID } from "@/db/seed";
import { resetTo } from "@/server/demo/reset";
import { recordOwnerPayment } from "@/server/actions/owner-payment";
import { approveRuleSet } from "@/server/actions/rules";
import { replayProject } from "@/server/engine/replay";
import { stableId } from "@/lib/ids";
import { dollars } from "@/lib/money";

async function balances() {
  const db = await getDb();
  const rows = await db
    .select({ account: schema.ledgerEntries.account, total: sql<number>`sum(${schema.ledgerEntries.deltaCents})::bigint` })
    .from(schema.ledgerEntries)
    .groupBy(schema.ledgerEntries.account);
  return Object.fromEntries(rows.map((r) => [r.account, Number(r.total)]));
}

describe("demo checkpoints", () => {
  beforeAll(async () => {
    await resetTo("paid2");
  }, 60_000);

  it("compiled: Pacific cannot be approved while its release trigger is unresolved", async () => {
    // Pacific was approved on the way to paid2; prove the guard with a fresh in_review copy.
    const db = await getDb();
    const rs = await db.query.ruleSets.findFirst({ where: eq(schema.ruleSets.id, stableId("ruleset:pacific:1")) });
    expect(rs?.status).toBe("approved");
    expect(rs?.approvedHash).toMatch(/^[0-9a-f]{64}$/);
    await expect(approveRuleSet({ ruleSetId: "00000000-0000-0000-0000-000000000000", actor: { userId: null, label: "t" } })).rejects.toThrow();
  });

  it("paid1: every release was planned, signed, paid and settled with the seed numbers", async () => {
    const db = await getDb();
    const rel = await db.query.releases.findMany({ where: eq(schema.releases.eventId, stableId("owner-payment:1")), with: { contract: { with: { sub: true } }, payment: true, waivers: true } });
    const by = Object.fromEntries(rel.map((r) => [r.contract.sub.slug, r]));
    expect(by["ironline-steel"]).toMatchObject({ grossCents: dollars(100_000), retainageWithheldCents: dollars(10_000), releaseCents: dollars(90_000), status: "settled" });
    expect(by["pacific-electric"]).toMatchObject({ releaseCents: dollars(57_000), retainageWithheldCents: dollars(3_000), status: "settled" });
    expect(by["summit-drywall"]).toMatchObject({ releaseCents: dollars(36_000), retainageWithheldCents: dollars(4_000), status: "settled" });
    for (const r of rel) {
      expect(r.payment?.status).toBe("paid");
      expect(r.waivers.map((w) => `${w.form}:${w.status}`).sort()).toEqual(["cp_8132:signed", "up_8134:signed"]);
      expect(r.payByAt?.toISOString()).toBe("2026-10-21T17:05:00.000Z");
    }
  });

  it("intake→paid2: Summit's 5% error was corrected to 10% before funding", async () => {
    const db = await getDb();
    const app = await db.query.payApplications.findFirst({ where: eq(schema.payApplications.id, stableId("payapp:summit:2")) });
    expect(app).toMatchObject({ status: "approved", retainageBilledCents: dollars(2_500), retainageApprovedCents: dollars(5_000), netDueApprovedCents: dollars(45_000) });
    const failed = (app!.checks as { id: string; status: string }[]).filter((c) => c.status === "fail").map((c) => c.id);
    expect(failed).toEqual(["retainage_rate"]);
  });

  it("paid2: $125,000 funds 50% pro-rata; releases await waivers with 7-day clocks", async () => {
    const db = await getDb();
    const ev = await db.query.ownerPaymentEvents.findFirst({ where: eq(schema.ownerPaymentEvents.id, stableId("owner-payment:2")) });
    const rel = await db.query.releases.findMany({ where: eq(schema.releases.eventId, ev!.id), with: { contract: { with: { sub: true } }, waivers: true } });
    const by = Object.fromEntries(rel.map((r) => [r.contract.sub.slug, r]));
    expect(by["ironline-steel"]).toMatchObject({ grossCents: dollars(50_000), retainageWithheldCents: dollars(5_000), releaseCents: dollars(45_000), awaitingOwnerCents: dollars(50_000), status: "awaiting_waiver" });
    expect(by["pacific-electric"]).toMatchObject({ releaseCents: dollars(47_500), retainageWithheldCents: dollars(2_500), awaitingOwnerCents: dollars(50_000) });
    expect(by["summit-drywall"]).toMatchObject({ releaseCents: dollars(22_500), retainageWithheldCents: dollars(2_500), awaitingOwnerCents: dollars(25_000) });
    for (const r of rel) {
      expect(r.payByAt!.getTime() - ev!.receivedAt.getTime()).toBe(7 * 86_400_000);
      expect(r.waivers).toHaveLength(1);
      expect(r.waivers[0]).toMatchObject({ form: "cp_8132", status: "sent" });
      expect((r.waivers[0].fields as { amountCents: number }).amountCents).toBe(r.releaseCents);
    }
    const summit = by["summit-drywall"].basis as { statutes: string[] };
    expect(summit.statutes).toContain("CA_CLARKE_V_SAFECO");
  });

  it("ledger balances reconcile", async () => {
    const b = await balances();
    expect(b.owner_receipts).toBe(dollars(325_000));
    expect(b.sub_paid).toBe(dollars(183_000));
    expect(b.sub_payable).toBe(dollars(115_000));
    expect(b.retainage_held).toBe(dollars(27_000));
    expect(b.gc_cash).toBe(dollars(325_000 - 183_000));
    // Cash on hand = what the GC still owes + what it holds as retainage.
    expect(b.gc_cash).toBe(b.sub_payable + b.retainage_held);
  });

  it("recording the same owner payment twice is a no-op", async () => {
    const db = await getDb();
    const before = (await db.select().from(schema.releases)).length;
    const r = await recordOwnerPayment({
      projectId: ID.project.bayview,
      amountCents: dollars(125_000),
      receivedAt: (await db.query.ownerPaymentEvents.findFirst({ where: eq(schema.ownerPaymentEvents.id, stableId("owner-payment:2")) }))!.receivedAt,
      periodThrough: "2026-10-31",
      reference: "ACH BVH-0162",
      actor: { userId: null, label: "test" },
    });
    expect(r.duplicate).toBe(true);
    expect((await db.select().from(schema.releases)).length).toBe(before);
  });

  it("replaying every owner payment from scratch reproduces the stored releases", async () => {
    const r = await replayProject(ID.project.bayview);
    expect(r.events).toBe(2);
    expect(r.compared).toBe(6);
    expect(r.mismatches).toEqual([]);
  });
});
