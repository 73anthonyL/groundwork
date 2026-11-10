/** The closeout checkpoint builds through the real actions and leaves a consistent, replayable state. */
import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { ID } from "@/db/seed";
import { CLOSEOUT, resetTo } from "@/server/demo/reset";
import { replayProject } from "@/server/engine/replay";
import { getContractAdjustments, getProjectBoard } from "@/server/scoped";
import { advanceRelease } from "@/server/actions/payments";
import { dollars } from "@/lib/money";
import type { StoredRules } from "@/server/rules/review";

describe("closeout checkpoint", () => {
  beforeAll(async () => {
    await resetTo("closeout");
  }, 60_000);

  const meridian = async () => (await (await getDb()).query.organizations.findFirst({ where: eq(schema.organizations.id, ID.org.meridian) }))!;

  it("shows three owner payments on the board and keeps the supplier's event off it", async () => {
    const board = (await getProjectBoard(await meridian(), ID.project.bayview))!;
    expect(board.events).toHaveLength(3);
    expect(board.events.every((e) => e.payerContractId === null)).toBe(true);
    // Lower-tier parties are not the general contractor's subcontracts.
    expect(board.contracts).toHaveLength(3);
    expect(board.balances.backcharge_recovered).toBe(dollars(1_500));
    expect(board.balances.lower_tier_payable).toBe(dollars(12_000));
  });

  it("leaves Ironline's third release signed and waiting on its supplier", async () => {
    const db = await getDb();
    const down = (await db.query.ownerPaymentEvents.findFirst({ where: eq(schema.ownerPaymentEvents.payerContractId, ID.contract.ironline), with: { releases: true } }))!;
    expect(down.releases[0]).toMatchObject({ contractId: CLOSEOUT.rebarContract, status: "awaiting_waiver", releaseCents: dollars(12_000) });
    expect(await advanceRelease(down.parentReleaseId!)).toMatchObject({ initiated: false, waitingOn: "lower_tier_waivers" });
  });

  it("carries the adjustments the contract page shows", async () => {
    const iron = (await getContractAdjustments(await meridian(), ID.contract.ironline))!;
    expect(iron.contract.contractSumCents).toBe(dollars(420_000));
    expect(iron.changeOrders.map((c) => c.status)).toEqual(["approved"]);
    expect(iron.retention).toMatchObject({ heldCents: dollars(25_000), earmarkedCents: dollars(12_500), certifiableCents: dollars(12_500) });
    expect(iron.lowerTier.map((c) => c.sub.name)).toEqual(["Bay Rebar Supply"]);
    const pacific = (await getContractAdjustments(await meridian(), ID.contract.pacific))!;
    expect(pacific.changeOrders.map((c) => c.status)).toEqual(["proposed"]);
    const summit = (await getContractAdjustments(await meridian(), ID.contract.summit))!;
    expect(summit.backcharge).toMatchObject({ chargedCents: dollars(1_500), appliedCents: dollars(1_500), outstandingCents: 0 });
  });

  it("compiles the Texas subcontract under Texas law and leaves it for review", async () => {
    const db = await getDb();
    const rs = (await db.query.ruleSets.findFirst({ where: eq(schema.ruleSets.contractId, ID.texas.lonestar) }))!;
    expect(rs.status).toBe("in_review");
    const stored = rs.rules as StoredRules;
    expect(stored.overlay).toMatchObject({ state: "TX", progressPaymentDaysDefault: 7, progressPaymentOverridable: false, payIfPaid: "limited", statutoryWaiverForm: true });
    expect(stored.extracted.timing.days.value).toBe(30);
    // The contract's 30 days cannot stand against the statute's 7, and pay-if-paid is limited in Texas.
    expect(stored.annotations["timing.days"].review.reasons.join(" ")).toMatch(/within 7 days/);
    expect(stored.annotations["timing.type"].review.reasons.join(" ")).toMatch(/limited in TX/);
    expect(stored.overlay.caveats?.join(" ")).toMatch(/statutory lien waiver forms/);
    // Every quote the model gave for this contract is in the PDF.
    expect(Object.values(stored.annotations).filter((a) => a.verification.status === "unverified")).toEqual([]);
  });

  it("replays cleanly", async () => {
    const r = await replayProject(ID.project.bayview);
    expect(r.mismatches).toEqual([]);
    expect(r.events).toBe(4);
  });
});
