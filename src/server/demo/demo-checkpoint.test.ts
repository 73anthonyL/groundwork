/** The demo checkpoint leaves every role in the sample workspace with something to do. */
import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { ID } from "@/db/seed";
import { stableId } from "@/lib/ids";
import { dollars } from "@/lib/money";
import { resetTo } from "@/server/demo/reset";

describe("demo checkpoint", () => {
  beforeAll(async () => {
    await resetTo("demo");
  }, 60_000);

  it("funds the two approved pay apps from the second owner payment and asks each sub for a waiver", async () => {
    const db = await getDb();
    const releases = await db.query.releases.findMany({ where: eq(schema.releases.eventId, stableId("owner-payment:2")) });
    expect(releases.map((r) => [r.contractId, r.status, r.releaseCents]).sort()).toEqual(
      [
        [ID.contract.ironline, "awaiting_waiver", dollars(45_000)],
        [ID.contract.pacific, "awaiting_waiver", dollars(47_500)],
      ].sort(),
    );
  });

  it("leaves Summit's pay app for the controller and its first payment for Summit to confirm", async () => {
    const db = await getDb();
    const app = await db.query.payApplications.findFirst({ where: eq(schema.payApplications.id, stableId("payapp:summit:2")) });
    expect(app?.status).toBe("submitted");
    const waivers = await db.query.lienWaivers.findMany({ with: { release: true } });
    const open = waivers.filter((w) => w.status === "sent" && w.form.startsWith("u"));
    expect(open).toHaveLength(1);
    expect(open[0].release.contractId).toBe(ID.contract.summit);
  });
});
