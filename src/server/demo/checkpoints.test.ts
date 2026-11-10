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

  it("replays cleanly", async () => {
    const r = await replayProject(ID.project.bayview);
    expect(r.mismatches).toEqual([]);
    expect(r.events).toBe(4);
  });
});
