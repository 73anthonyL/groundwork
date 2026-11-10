/** The read model: what each organization may see, and that the pictures add up to the ledger. */
import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import type { Organization } from "@/db/schema";
import { ID } from "@/db/seed";
import { CLOSEOUT, resetTo } from "@/server/demo/reset";
import { recordOwnerPayment } from "@/server/actions/owner-payment";
import { handleRailWebhook, signWaiver } from "@/server/actions/payments";
import { projectClocks, projectFlow, projectOverview, projectSeries, projectSummary, projectTimeline } from "./project";
import { dollars } from "@/lib/money";

const P = ID.project.bayview;
let meridian: Organization, ironline: Organization, pacific: Organization, bayview: Organization, lonestar: Organization;

beforeAll(async () => {
  await resetTo("closeout");
  const db = await getDb();
  const org = async (id: string) => (await db.query.organizations.findFirst({ where: eq(schema.organizations.id, id) }))!;
  [meridian, ironline, pacific, bayview, lonestar] = await Promise.all([org(ID.org.meridian), org(ID.org.ironline), org(ID.org.pacific), org(ID.org.bayview), org(ID.org.lonestar)]);
}, 60_000);

describe("project read model: the contractor's view", () => {
  it("summary totals match the ledger", async () => {
    const s = (await projectSummary(meridian, P))!;
    expect(s.totals.paidCents).toBe(s.balances.sub_paid);
    expect(s.totals.inMotionCents).toBe(s.balances.sub_payable);
    expect(s.totals.retainageHeldCents).toBe(s.balances.retainage_held);
    // Lower-tier rows are listed but never mixed into the contractor's totals.
    expect(s.contracts.filter((c) => c.tier === 2).map((c) => c.payee)).toEqual(["Bay Rebar Supply"]);
    expect(s.totals.committedCents).toBe(dollars(920_000));
    expect(s.totals.awaitingOwnerCents).toBe(0);
  });

  it("every owner payment's ribbons add up to the payment", async () => {
    const f = (await projectFlow(meridian, P))!;
    for (const e of f.events.filter((x) => x.tier === 1)) {
      const out = e.links.filter((l) => l.source === "gc").reduce((s, l) => s + l.cents, 0);
      expect(out, e.reference).toBe(e.amountCents - e.retentionCents);
      expect(e.links.find((l) => l.source === "owner")!.cents).toBe(e.amountCents);
    }
    expect(f.totalInCents).toBe(dollars(500_000));
    // One hop down: the supplier's share leaves the subcontractor, not the contractor.
    const down = f.events.find((e) => e.tier === 2)!;
    expect(down.links).toEqual([expect.objectContaining({ source: `c:${ID.contract.ironline}`, target: `c:${CLOSEOUT.rebarContract}`, cents: dollars(12_000), kind: "moving" })]);
  });

  it("the retainage sink drains when certified retainage is released", async () => {
    await recordOwnerPayment({ projectId: P, amountCents: dollars(12_500), retentionCents: dollars(12_500), receivedAt: new Date(), periodThrough: "2026-12-31", reference: "RET-1", actor: { userId: ID.user.priya, label: "Priya" } });
    const [f, s] = [(await projectFlow(meridian, P))!, (await projectSummary(meridian, P))!];
    const sink = f.links.filter((l) => l.target === "retainage").reduce((x, l) => x + l.cents, 0);
    expect(sink).toBe(s.totals.retainageHeldCents);
    expect(sink).toBe(dollars(29_500));
  });

  it("a release whose bank payment failed stays owed and on the clock", async () => {
    const db = await getDb();
    const rel = (await db.query.releases.findFirst({ where: eq(schema.releases.contractId, ID.contract.pacific), with: { waivers: true }, orderBy: (r, { desc }) => [desc(r.createdAt)] }))!;
    const before = (await projectSummary(meridian, P))!.totals;
    await signWaiver({ waiverId: rel.waivers[0].id, signerName: "Tom Nakamura", signerTitle: "President", actor: { userId: ID.user.tom, label: "Tom" } });
    const pay = (await db.query.payments.findFirst({ where: eq(schema.payments.releaseId, rel.id) }))!;
    await handleRailWebhook("simulated", { externalEventId: "read-fail", type: "bill.failed", externalBillId: pay.externalBillId!, raw: {} });
    const after = (await projectSummary(meridian, P))!.totals;
    expect(after.inMotionCents).toBe(before.inMotionCents);
    expect(after.openReleases).toBe(before.openReleases);
    expect((await projectClocks(meridian, P))!.some((c) => c.releaseId === rel.id && c.status === "blocked")).toBe(true);
  });

  it("the timeline and series cover the whole project", async () => {
    const [t, series] = [(await projectTimeline(meridian, P))!, (await projectSeries(meridian, P))!];
    expect(new Set(t.map((e) => e.lane))).toEqual(new Set(["contract", "billing", "money", "waiver", "adjustment"]));
    expect(t.every((e) => !/^[a-z_]+\.[a-z_]+$/.test(e.title))).toBe(true);
    expect([...t].sort((a, b) => a.at.localeCompare(b.at)).map((e) => e.id)).toEqual(t.map((e) => e.id));
    expect(series.at(-1)!.balances.owner_receipts).toBe(dollars(512_500));
  });
});

describe("project read model: what a subcontractor may see", () => {
  it("sees its own contract and its lower tier, and nobody else's", async () => {
    const o = (await projectOverview(ironline, P))!;
    expect(o.summary.contracts.map((c) => c.payee).sort()).toEqual(["Bay Rebar Supply", "Ironline Steel"]);
    const text = JSON.stringify(o);
    expect(text).not.toContain("Pacific Electric");
    expect(text).not.toContain("Summit Drywall");
    expect(o.summary.balances.owner_receipts).toBeUndefined();
    expect(o.summary.balances.gc_cash).toBeUndefined();
  });

  it("never learns the size or bank reference of the owner's payments", async () => {
    const f = (await projectFlow(ironline, P))!;
    const text = JSON.stringify(f);
    expect(text).not.toContain("ACH BVH");
    expect(f.nodes.some((n) => n.id === "unallocated")).toBe(false);
    for (const e of f.events) {
      expect(e.retentionCents).toBe(0);
      expect(e.amountCents).toBe(e.links.reduce((s, l) => s + Math.max(0, l.cents), 0));
      expect(e.links.some((l) => l.source === "owner")).toBe(false);
    }
    expect(f.totalInCents).toBeLessThan(dollars(300_000));
  });

  it("does not see the contractor's review notes, signing tokens, or other subs' clocks", async () => {
    const o = (await projectOverview(pacific, P))!;
    const rules = o.timeline.filter((e) => e.type.startsWith("rules."));
    expect(rules.length).toBeGreaterThan(0);
    expect(rules.every((e) => e.detail === null)).toBe(true);
    expect(o.clocks.every((c) => c.party === "Pacific Electric")).toBe(true);
    expect(JSON.stringify(await projectOverview(ironline, P))).not.toMatch(/signToken|sign_token/);
  });

  it("an organization with no stake in the project gets nothing", async () => {
    expect(await projectOverview(lonestar, P)).toBeNull();
    expect(await projectSummary(bayview, ID.project.congress)).toBeNull();
    // The owner sees its own project whole.
    expect((await projectSummary(bayview, P))!.contracts.filter((c) => c.tier === 1)).toHaveLength(3);
  });
});
