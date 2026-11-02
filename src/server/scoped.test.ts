import { beforeAll, describe, expect, it } from "vitest";
import { getDb, schema } from "@/db/client";
import { ID, seedBaseline } from "@/db/seed";
import { getContract, getProject, listContracts, listProjects } from "./scoped";
import { eq } from "drizzle-orm";
import type { Organization } from "@/db/schema";

let orgs: Record<string, Organization>;

beforeAll(async () => {
  const db = await getDb();
  await seedBaseline(db);
  const rows = await db.select().from(schema.organizations);
  orgs = Object.fromEntries(rows.map((o) => [o.slug, o]));
});

describe("org scoping", () => {
  it("GC sees every contract on its project", async () => {
    const rows = await listContracts(orgs["meridian-builders"]);
    expect(rows.map((r) => r.id).sort()).toEqual(Object.values(ID.contract).sort());
  });

  it("a sub sees only its own contract", async () => {
    const rows = await listContracts(orgs["summit-drywall"]);
    expect(rows.map((r) => r.id)).toEqual([ID.contract.summit]);
  });

  it("a sub reading another sub's contract gets nothing", async () => {
    expect(await getContract(orgs["ironline-steel"], ID.contract.summit)).toBeNull();
    expect(await getContract(orgs["ironline-steel"], ID.contract.ironline)).not.toBeNull();
  });

  it("owner sees contracts under its project; a stranger owner sees none", async () => {
    expect((await listContracts(orgs["bayview-health"])).length).toBe(3);
    const db = await getDb();
    const strangerId = "11111111-1111-4111-8111-111111111111";
    await db
      .insert(schema.organizations)
      .values({ id: strangerId, kind: "owner", name: "Stranger LLC", slug: "stranger" })
      .onConflictDoNothing();
    const [stranger] = await db.select().from(schema.organizations).where(eq(schema.organizations.id, strangerId));
    expect(await listContracts(stranger)).toEqual([]);
    expect(await listProjects(stranger)).toEqual([]);
    expect(await getProject(stranger, ID.project.bayview)).toBeNull();
  });

  it("sub sees the project it has a contract on", async () => {
    const projectsForSummit = await listProjects(orgs["summit-drywall"]);
    expect(projectsForSummit.map((p) => p.id)).toEqual([ID.project.bayview]);
  });
});
