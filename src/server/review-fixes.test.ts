/** Regression tests for defects found in review: retry, sweep, replay after a change order, token handling. */
import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { ID } from "@/db/seed";
import { resetTo } from "@/server/demo/reset";
import { recordOwnerPayment } from "@/server/actions/owner-payment";
import { handleRailWebhook, retryRelease, signWaiver, sweepReadyReleases } from "@/server/actions/payments";
import { decideChangeOrder, proposeChangeOrder } from "@/server/actions/adjustments";
import { addLowerTierParty, listLowerTier } from "@/server/actions/lower-tier";
import { approveRuleSet, resolveField } from "@/server/actions/rules";
import { replayProject } from "@/server/engine/replay";
import { demoOutbox } from "@/server/scoped";
import { fromWire } from "@/lib/ai/extractRuleSet";
import { stableId } from "@/lib/ids";
import { dollars } from "@/lib/money";

const GC = { userId: ID.user.priya, label: "Priya Natarajan" };
const ROSA = { userId: ID.user.rosa, label: "Rosa Delgado" };

describe("a failed payment can be sent again", () => {
  beforeAll(async () => {
    await resetTo("paid2");
  }, 60_000);

  it("retry reuses the one payment row and the release goes out; a late failure notice cannot undo a settlement", async () => {
    const db = await getDb();
    const rel = (await db.query.releases.findFirst({ where: eq(schema.releases.contractId, ID.contract.ironline), with: { waivers: true }, orderBy: (r, { desc }) => [desc(r.createdAt)] }))!;
    expect(rel.status).toBe("awaiting_waiver");
    await expect(retryRelease({ releaseId: rel.id, actor: GC })).rejects.toThrow(/not blocked/);
    await signWaiver({ waiverId: rel.waivers[0].id, signerName: "Rosa Delgado", signerTitle: "Office Manager", actor: ROSA });
    const first = (await db.query.payments.findFirst({ where: eq(schema.payments.releaseId, rel.id) }))!;
    // The bank reports the bill failed.
    await handleRailWebhook("simulated", { externalEventId: "fail-1", type: "bill.failed", externalBillId: first.externalBillId!, raw: {} });
    expect((await db.query.releases.findFirst({ where: eq(schema.releases.id, rel.id) }))!.status).toBe("blocked");
    const r = await retryRelease({ releaseId: rel.id, actor: GC });
    expect(r.initiated).toBe(true);
    const payments = await db.query.payments.findMany({ where: eq(schema.payments.releaseId, rel.id) });
    expect(payments).toHaveLength(1);
    expect(payments[0]).toMatchObject({ id: first.id, status: "released" });
    await handleRailWebhook("simulated", { externalEventId: "paid-1", type: "bill.paid", externalBillId: payments[0].externalBillId!, raw: {} });
    await handleRailWebhook("simulated", { externalEventId: "fail-late", type: "bill.failed", externalBillId: payments[0].externalBillId!, raw: {} });
    expect((await db.query.releases.findFirst({ where: eq(schema.releases.id, rel.id) }))!.status).toBe("paid");
    expect((await sweepReadyReleases()).failed).toEqual([]);
  });
});

describe("replay and the lower tier", () => {
  beforeAll(async () => {
    await resetTo("paid1");
  }, 60_000);

  it("replay uses the contract sum as it stood at each event, so a later change order does not move a retainage cap", async () => {
    const db = await getDb();
    // Give Ironline a 3% cap on total retention: 3% of $400,000 is $12,000, and $10,000 is already held.
    const row = (await db.query.ruleSets.findFirst({ where: eq(schema.ruleSets.id, stableId("ruleset:ironline:1")) }))!;
    const copy = structuredClone(row.rules) as { annotations: Record<string, unknown> };
    const v2 = stableId("ruleset:ironline:2");
    await db.insert(schema.ruleSets).values({ ...row, id: v2, version: 2, status: "in_review", rules: copy, approvedAt: null, approvedBy: null, approvedHash: null });
    await resolveField({ ruleSetId: v2, path: "retainage.cap_bps", decision: "override", value: 300, note: "Test cap.", actor: GC });
    await approveRuleSet({ ruleSetId: v2, actor: GC });
    const { submitPayApp, reviewPayApp } = await import("@/server/actions/pay-apps");
    const app = await submitPayApp({ contractId: ID.contract.ironline, number: 2, periodThrough: "2026-10-31", lines: [{ sovLineId: stableId(`sov:${ID.contract.ironline}:3`), thisPeriodCents: dollars(60_000), storedCents: 0 }], retainageBilledCents: dollars(6_000), previouslyBilledCents: dollars(100_000), actor: ROSA });
    await reviewPayApp({ payAppId: app.id, decision: "approve", actor: GC });
    const r = await recordOwnerPayment({ projectId: ID.project.bayview, amountCents: dollars(60_000), receivedAt: new Date("2026-11-10T17:00:00Z"), periodThrough: "2026-10-31", reference: "CAP-1", actor: GC });
    // Only $2,000 of room is left under the cap.
    expect(r.plan.releases[0].retainageWithheldCents).toBe(dollars(2_000));
    const co = await proposeChangeOrder({ contractId: ID.contract.ironline, title: "Large add", amountCents: dollars(200_000), actor: ROSA });
    await decideChangeOrder({ changeOrderId: co.id, decision: "approve", actor: GC });
    expect((await replayProject(ID.project.bayview)).mismatches).toEqual([]);
  });

  it("the payer never receives its claimant's signing token; the demo outbox does", async () => {
    const db = await getDb();
    const party = await addLowerTierParty({ parentContractId: ID.contract.pacific, name: "Delta Wire Co", kind: "supplier", scope: "Wire", sumCents: dollars(20_000), actor: { userId: ID.user.tom, label: "Tom Nakamura" } });
    await expect(addLowerTierParty({ parentContractId: ID.contract.pacific, name: "Held Co", kind: "supplier", scope: "x", sumCents: dollars(1_000), retainageBps: 500, actor: GC })).rejects.toThrow(/not supported/);
    const { submitPayApp, reviewPayApp } = await import("@/server/actions/pay-apps");
    const app = await submitPayApp({ contractId: ID.contract.pacific, number: 2, periodThrough: "2026-10-31", lines: [{ sovLineId: stableId(`sov:${ID.contract.pacific}:2`), thisPeriodCents: dollars(40_000), storedCents: 0 }], retainageBilledCents: dollars(2_000), previouslyBilledCents: dollars(60_000), lowerTier: [{ contractId: party.id, amountCents: dollars(8_000) }], actor: { userId: ID.user.tom, label: "Tom Nakamura" } });
    await reviewPayApp({ payAppId: app.id, decision: "approve", actor: GC });
    await recordOwnerPayment({ projectId: ID.project.bayview, amountCents: dollars(40_000), receivedAt: new Date("2026-11-11T17:00:00Z"), periodThrough: "2026-10-31", reference: "LT-1", actor: GC });
    const [child] = await listLowerTier(db, ID.contract.pacific);
    expect(child.releases).toHaveLength(1);
    expect(child.releases[0].waivers.every((w) => w.signToken === null)).toBe(true);
    expect(JSON.stringify(child)).not.toMatch(/"signToken":"[\w-]{20,}"/);
    const outbox = await demoOutbox();
    expect(outbox.find((m) => m.to === "Delta Wire Co")?.href).toMatch(/^\/w\/[\w-]{20,}$/);
  });
});

describe("extraction parser", () => {
  it("does not read an empty number as zero", () => {
    const entry = { path: "retainage.percent_bps" as const, found: true, value: "", quote: "ten percent", page: 2, confidence: "high" as const, rationale: "x" };
    expect(() => fromWire({ fields: [entry], anomalies: [] })).toThrow(/not a number/);
  });
});
