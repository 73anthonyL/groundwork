/** Org scoping of the money objects: releases, waivers, pay applications, documents and the ledger. */
import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import type { Organization } from "@/db/schema";
import { ID } from "@/db/seed";
import { resetTo } from "@/server/demo/reset";
import { getContractAdjustments, getDocument, getDownstream, getLedger, getPayApp, getProjectBoard, getRelease, getWaiver, getWaiverByToken, listReleasesForContract, listReleasesForOrg } from "./scoped";
import { stableId } from "@/lib/ids";

let meridian: Organization, ironline: Organization, summit: Organization, bayview: Organization, brazos: Organization, lonestar: Organization;
let ironlineRelease: { id: string; waiverId: string };
let ironlineDocumentId: string;

beforeAll(async () => {
  await resetTo("paid2");
  const db = await getDb();
  const org = async (id: string) => (await db.query.organizations.findFirst({ where: eq(schema.organizations.id, id) }))!;
  [meridian, ironline, summit, bayview, brazos, lonestar] = await Promise.all([org(ID.org.meridian), org(ID.org.ironline), org(ID.org.summit), org(ID.org.bayview), org(ID.org.brazos), org(ID.org.lonestar)]);
  const rel = (await db.query.releases.findFirst({ where: eq(schema.releases.contractId, ID.contract.ironline), with: { waivers: true } }))!;
  ironlineRelease = { id: rel.id, waiverId: rel.waivers[0].id };
  ironlineDocumentId = (await db.query.contracts.findFirst({ where: eq(schema.contracts.id, ID.contract.ironline) }))!.documentId!;
}, 60_000);

describe("who can read a release, its waiver and its pay application", () => {
  const payAppId = stableId("payapp:ironline:1");

  it("the subcontractor it pays, its contractor and the project's owner can", async () => {
    for (const org of [ironline, meridian, bayview]) {
      expect((await getRelease(org, ironlineRelease.id))?.id, org.name).toBe(ironlineRelease.id);
      expect((await getWaiver(org, ironlineRelease.waiverId))?.id, org.name).toBe(ironlineRelease.waiverId);
      expect((await getPayApp(org, payAppId))?.id, org.name).toBe(payAppId);
      expect((await listReleasesForContract(org, ID.contract.ironline)).length, org.name).toBeGreaterThan(0);
    }
  });

  it("another subcontractor on the same project, a subcontractor on another project and another project's owner cannot", async () => {
    for (const org of [summit, lonestar, brazos]) {
      expect(await getRelease(org, ironlineRelease.id), org.name).toBeNull();
      expect(await getWaiver(org, ironlineRelease.waiverId), org.name).toBeNull();
      expect(await getPayApp(org, payAppId), org.name).toBeNull();
      expect(await listReleasesForContract(org, ID.contract.ironline), org.name).toEqual([]);
      expect(await getDownstream(org, ironlineRelease.id), org.name).toEqual([]);
      expect(await getContractAdjustments(org, ID.contract.ironline), org.name).toBeNull();
      expect(await getDocument(org, ironlineDocumentId), org.name).toBeNull();
    }
    expect((await getDocument(ironline, ironlineDocumentId))?.id).toBe(ironlineDocumentId);
  });

  it("ids that are not ids read as nothing rather than failing", async () => {
    expect(await getRelease(ironline, "00000000-0000-0000-0000-000000000000")).toBeNull();
    expect(await getWaiver(ironline, "00000000-0000-0000-0000-000000000000")).toBeNull();
    expect(await getPayApp(ironline, "00000000-0000-0000-0000-000000000000")).toBeNull();
  });
});

describe("lists and the board", () => {
  it("a subcontractor's releases are its own, across every list", async () => {
    const mine = await listReleasesForOrg(summit);
    expect(mine.length).toBeGreaterThan(0);
    expect(new Set(mine.map((r) => r.contractId))).toEqual(new Set([ID.contract.summit]));
    const board = (await getProjectBoard(summit, ID.project.bayview))!;
    expect(board.contracts.map((c) => c.id)).toEqual([ID.contract.summit]);
    for (const e of board.events) for (const r of e.releases) expect(r.contractId).toBe(ID.contract.summit);
  });

  it("the contractor's board has every release, and the releases of each owner payment add up to no more than the payment", async () => {
    const board = (await getProjectBoard(meridian, ID.project.bayview))!;
    expect(board.events).toHaveLength(2);
    for (const e of board.events) {
      expect(e.releases).toHaveLength(3);
      expect(e.releases.reduce((s, r) => s + r.grossCents, 0)).toBeLessThanOrEqual(e.amountCents);
    }
  });

  it("an organization with no part in a project gets no board and an empty ledger", async () => {
    expect(await getProjectBoard(brazos, ID.project.bayview)).toBeNull();
    expect(await getProjectBoard(lonestar, ID.project.bayview)).toBeNull();
    const ledger = await getLedger(lonestar);
    expect(ledger.entries.every((e) => e.projectId === ID.project.congress)).toBe(true);
    expect(ledger.projects.map((p) => p.id)).toEqual([ID.project.congress]);
  });
});

describe("signing links", () => {
  it("a token that is malformed or unknown opens nothing", async () => {
    for (const token of ["", "short", "../../etc/passwd", "a".repeat(19), `${"a".repeat(30)}'; drop table lien_waivers;--`]) expect(await getWaiverByToken(token), token).toBeNull();
    expect(await getWaiverByToken("a".repeat(32))).toBeNull();
  });
});
