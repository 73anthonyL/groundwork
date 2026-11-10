/** Creating a project, and that every read works on a project with no contracts and no payments yet. */
import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import type { Organization } from "@/db/schema";
import { ID, seedBaseline } from "@/db/seed";
import { signUp } from "@/server/actions/accounts";
import { createProject, ProjectInputError } from "@/server/actions/projects";
import { getContractAdjustments, getLedger, getProject, getProjectBoard, listContracts, listInvitations, listMembers, listProjects, listReleasesForOrg } from "@/server/scoped";
import { projectClocks, projectFlow, projectOverview, projectSeries, projectSummary, projectTimeline } from "@/server/read/project";
import { replayProject } from "@/server/engine/replay";
import { dollars } from "@/lib/money";

let gc: Organization, other: Organization;
let actor: { userId: string; label: string };
const org = async (id: string) => (await (await getDb()).query.organizations.findFirst({ where: eq(schema.organizations.id, id) }))!;
const base = () => ({ gcOrgId: gc.id, name: "Harbor Lofts", address: " 12 Pier Road,  Oakland, CA ", state: "ca", ownerName: "Harbor  Holdings LLC", primeContractSumCents: dollars(3_000_000), contractDate: "2026-03-01", actor });

beforeAll(async () => {
  await seedBaseline(await getDb());
  const a = await signUp({ companyName: "Keel Builders", name: "Kim Keel", email: "kim@keelbuilders.com", password: "a long password" });
  const b = await signUp({ companyName: "Rival Builders", name: "Rae Rival", email: "rae@rivalbuilders.com", password: "a long password" });
  [gc, other] = [await org(a.orgId), await org(b.orgId)];
  actor = { userId: a.userId, label: "Kim Keel" };
});

describe("creating a project", () => {
  let projectId: string, ownerOrgId: string;

  it("creates the project and its owner, and records it in the audit trail", async () => {
    const r = await createProject(base());
    ({ projectId, ownerOrgId } = r);
    expect(r.ownerCreated).toBe(true);
    const p = (await getProject(gc, projectId))!;
    expect(p).toMatchObject({ name: "Harbor Lofts", address: "12 Pier Road, Oakland, CA", state: "CA", contractDate: "2026-03-01", primeContractSumCents: dollars(3_000_000), retentionCapBps: null, gcOrgId: gc.id });
    expect(p.owner).toMatchObject({ id: ownerOrgId, kind: "owner", name: "Harbor Holdings LLC", isDemo: false });
    const events = await (await getDb()).query.events.findMany({ where: eq(schema.events.aggregateId, projectId) });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: "project.created", aggregateType: "project", actorUserId: actor.userId, actorLabel: "Kim Keel" });
  });

  it("reuses an owner this contractor already works for, and never another contractor's owner of the same name", async () => {
    const second = await createProject({ ...base(), name: "Harbor Lofts Phase 2", ownerName: "harbor holdings llc" });
    expect(second).toMatchObject({ ownerOrgId, ownerCreated: false });
    const rae = (await (await getDb()).query.users.findFirst({ where: eq(schema.users.orgId, other.id) }))!;
    const theirs = await createProject({ ...base(), gcOrgId: other.id, actor: { userId: rae.id, label: rae.name } });
    expect(theirs.ownerCreated).toBe(true);
    expect(theirs.ownerOrgId).not.toBe(ownerOrgId);
    // A sample-workspace owner of the same name is not picked up either.
    const bayview = await createProject({ ...base(), name: "Clinic Annex", ownerName: "Bayview Health" });
    expect(bayview.ownerOrgId).not.toBe(ID.org.bayview);
    expect((await org(bayview.ownerOrgId)).isDemo).toBe(false);
  });

  it("refuses what a person can fix, and writes nothing", async () => {
    const before = (await (await getDb()).query.projects.findMany()).length;
    await expect(createProject({ ...base(), name: "N", state: "ZZ" })).rejects.toThrow(ProjectInputError);
    await expect(createProject({ ...base(), name: "New One", state: "ZZ" })).rejects.toMatchObject({ field: "state" });
    await expect(createProject({ ...base(), name: "New One", state: "toString" })).rejects.toMatchObject({ field: "state" });
    await expect(createProject({ ...base(), name: "New One", primeContractSumCents: 0 })).rejects.toMatchObject({ field: "primeContractSumCents" });
    await expect(createProject({ ...base(), name: "New One", primeContractSumCents: 12.5 })).rejects.toMatchObject({ field: "primeContractSumCents" });
    await expect(createProject({ ...base(), name: "New One", contractDate: "2026-02-30" })).rejects.toMatchObject({ field: "contractDate" });
    await expect(createProject({ ...base(), name: "New One", ownerName: " " })).rejects.toMatchObject({ field: "ownerName" });
    await expect(createProject({ ...base(), name: "harbor lofts" })).rejects.toMatchObject({ field: "name", message: expect.stringMatching(/already have a project/) });
    // Not a contractor, and not this contractor's person.
    await expect(createProject({ ...base(), name: "New One", gcOrgId: ownerOrgId })).rejects.toThrow(/Only a general contractor/);
    await expect(createProject({ ...base(), name: "New One", gcOrgId: other.id })).rejects.toThrow(/Only a general contractor/);
    expect((await (await getDb()).query.projects.findMany()).length).toBe(before);
  });

  describe("an empty project", () => {
    it("reads through the scoped helpers for the contractor and the owner", async () => {
      const owner = await org(ownerOrgId);
      expect((await listProjects(gc)).map((p) => p.name).sort()).toEqual(["Clinic Annex", "Harbor Lofts", "Harbor Lofts Phase 2"]);
      expect((await listProjects(owner)).map((p) => p.id).sort()).toEqual([projectId, (await listProjects(gc)).find((p) => p.name === "Harbor Lofts Phase 2")!.id].sort());
      for (const who of [gc, owner]) {
        expect(await listContracts(who)).toEqual([]);
        expect(await listContracts(who, projectId)).toEqual([]);
        expect(await listReleasesForOrg(who)).toEqual([]);
        const board = (await getProjectBoard(who, projectId))!;
        expect(board).toMatchObject({ contracts: [], events: [], balances: {} });
        expect(board.project.id).toBe(projectId);
        const ledger = await getLedger(who);
        expect(ledger.entries).toEqual([]);
        expect(ledger.balances).toEqual({});
        expect(ledger.projects.map((p) => p.id)).toContain(projectId);
      }
      expect(await getContractAdjustments(gc, projectId)).toBeNull();
      expect(await listInvitations(gc)).toEqual([]);
      expect(await listMembers(gc)).toEqual([expect.objectContaining({ name: "Kim Keel", hasPassword: true })]);
      expect((await listMembers(gc))[0]).not.toHaveProperty("passwordHash");
    });

    it("reads through the project read model with zeroes, not errors", async () => {
      const s = (await projectSummary(gc, projectId))!;
      expect(s.project).toMatchObject({ name: "Harbor Lofts", state: "CA", owner: "Harbor Holdings LLC", gc: "Keel Builders" });
      expect(s.contracts).toEqual([]);
      expect(s.balances).toEqual({});
      expect(s.totals).toEqual({ committedCents: 0, billedCents: 0, paidCents: 0, inMotionCents: 0, retainageHeldCents: 0, awaitingOwnerCents: 0, openReleases: 0, overdueReleases: 0 });
      const f = (await projectFlow(gc, projectId))!;
      expect(f).toMatchObject({ links: [], events: [], totalInCents: 0 });
      expect(f.nodes.map((n) => n.kind)).toEqual(["owner", "gc"]);
      const t = (await projectTimeline(gc, projectId))!;
      expect(t).toEqual([expect.objectContaining({ type: "project.created", title: "Project created", detail: "Harbor Lofts", actor: "Kim Keel", contractId: null })]);
      expect(await projectSeries(gc, projectId)).toEqual([]);
      expect(await projectClocks(gc, projectId)).toEqual([]);
      const o = (await projectOverview(gc, projectId))!;
      expect(o).toMatchObject({ flow: { events: [] }, series: [], clocks: [] });
      expect(JSON.parse(JSON.stringify(o)).summary.totals.committedCents).toBe(0);
      await expect(replayProject(projectId)).resolves.toBeDefined();
    });

    it("is invisible to another contractor and to the sample workspace", async () => {
      for (const stranger of [other, await org(ID.org.meridian), await org(ID.org.ironline), await org(ID.org.bayview)]) {
        expect(await getProject(stranger, projectId)).toBeNull();
        expect(await getProjectBoard(stranger, projectId)).toBeNull();
        expect(await projectOverview(stranger, projectId)).toBeNull();
        expect((await listProjects(stranger)).map((p) => p.id)).not.toContain(projectId);
      }
    });
  });
});
