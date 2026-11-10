/** Resetting the sample workspace rebuilds the sample and leaves real companies and their records alone. */
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { getDb, schema, type Db } from "@/db/client";
import { ID, SEED } from "@/db/seed";
import { resetTo } from "@/server/demo/reset";
import { signUp, verifyCredentials } from "@/server/actions/accounts";
import { createProject } from "@/server/actions/projects";
import { addSubcontract } from "@/server/actions/contracts";
import { inviteMember, getInvitation } from "@/server/actions/invitations";
import { emit, post } from "@/server/events";
import { getProjectBoard, listContracts, listProjects } from "@/server/scoped";
import { projectOverview } from "@/server/read/project";
import { dollars } from "@/lib/money";

const PASSWORD = "a long password";
const pdf = () => new Uint8Array(readFileSync("evals/contracts/adv-days-in-words-only.pdf"));

const TABLES = ["organizations", "users", "invitations", "projects", "documents", "contracts", "sovLines", "ownerPaymentEvents", "events", "ledgerEntries", "webhookInbox"] as const;

type Snapshot = Record<string, Record<string, unknown>[]>;
const allRows = async (db: Db, t: (typeof TABLES)[number]) => ((await db.select().from(schema[t])) as { id: string }[]).sort((a, b) => a.id.localeCompare(b.id));
/** Ids present in the sample workspace alone, taken before any real account exists. */
const sampleIds = new Set<string>();
/** The real account's rows, in full, as they were before any reset. */
let before: Snapshot;

/** Every row the real account created, in full: the rows whose ids were made after the sample was seeded. */
async function realRows(db: Db): Promise<Snapshot> {
  const out: Snapshot = {};
  for (const t of TABLES) out[t] = (await allRows(db, t)).filter((r) => before ? before[t].some((b) => b.id === r.id) : !sampleIds.has(r.id));
  return out;
}

let orgId: string, userId: string, projectId: string, contractId: string, token: string;

beforeAll(async () => {
  await resetTo("fresh");
  const db = await getDb();
  for (const t of TABLES) for (const r of await allRows(db, t)) sampleIds.add(r.id);
  ({ orgId, userId } = await signUp({ companyName: "Keel Builders", name: "Kim Keel", email: "kim@keelbuilders.com", password: PASSWORD }));
  const actor = { userId, label: "Kim Keel" };
  ({ projectId } = await createProject({ gcOrgId: orgId, name: "Harbor Lofts", address: "12 Pier Road", state: "CA", ownerName: "Harbor Holdings", primeContractSumCents: dollars(3_000_000), contractDate: "2026-03-01", actor }));
  // Same subcontractor name as one in the sample workspace: it must stay a separate, real company.
  const sub = await addSubcontract({ projectId, gcOrgId: orgId, subName: "Ironline Steel", trade: "Steel", sumCents: dollars(90_000), contactEmail: "rosa@ironline-steel.com", filename: "steel.pdf", bytes: pdf(), actor });
  contractId = sub.contractId;
  token = sub.invitationToken!;
  await inviteMember({ orgId, email: "pat@keelbuilders.com", invitedBy: userId });
  // Money on the real project: an owner payment, its audit event and ledger postings, and a bank notice.
  await db.transaction(async (tx) => {
    const paymentId = randomUUID();
    await tx.insert(schema.ownerPaymentEvents).values({ id: paymentId, projectId, amountCents: dollars(50_000), receivedAt: new Date("2026-10-01T12:00:00Z"), periodThrough: "2026-09-30", reference: "ACH HL-0001", idempotencyKey: `test:${paymentId}`, recordedBy: userId });
    const eventId = await emit(tx, { aggregateType: "project", aggregateId: projectId, type: "owner_payment.recorded", actor, payload: { amountCents: dollars(50_000), reference: "ACH HL-0001" }, correlationId: paymentId });
    await post(tx, [
      { projectId, contractId: null, account: "owner_receipts", deltaCents: dollars(50_000), eventId, correlationId: paymentId, memo: "Owner payment ACH HL-0001" },
      { projectId, contractId, account: "sub_payable", deltaCents: dollars(9_000), eventId, correlationId: paymentId, memo: "Planned release" },
    ]);
    await tx.insert(schema.webhookInbox).values({ id: randomUUID(), rail: "simulated", externalEventId: "real-evt-1", payload: { note: "not a sample payment" }, processedAt: new Date() });
  });
  before = await realRows(db);
}, 120_000);

describe("demo reset and real accounts", () => {
  it("leaves every real row byte-for-byte the same, from any checkpoint to any other", async () => {
    const db = await getDb();
    expect(before.organizations).toHaveLength(3); // contractor, owner, subcontractor
    expect(before.ledgerEntries).toHaveLength(2);
    expect(before.events.length).toBeGreaterThanOrEqual(4);
    expect(before.documents).toHaveLength(1);
    expect(before.invitations).toHaveLength(2);
    expect(before.webhookInbox).toHaveLength(1);
    expect(before.users).toHaveLength(1);
    expect(before.projects).toHaveLength(1);
    expect(before.contracts).toHaveLength(1);
    expect(before.ownerPaymentEvents).toHaveLength(1);

    await resetTo("closeout"); // the fullest sample: lower tier, settled payments, bank notices, adjustments
    expect(await realRows(db)).toEqual(before);
    const fullInbox = (await db.select().from(schema.webhookInbox)).length;
    expect(fullInbox).toBeGreaterThan(1);
    await resetTo("fresh");
    expect(await realRows(db)).toEqual(before);
    await resetTo("paid2");
    expect(await realRows(db)).toEqual(before);
  });

  it("the real account still signs in, reads its project, and its invitation link still works", async () => {
    const db = await getDb();
    expect(await verifyCredentials({ email: "kim@keelbuilders.com", password: PASSWORD })).toMatchObject({ id: userId, orgId });
    const org = (await db.query.organizations.findFirst({ where: eq(schema.organizations.id, orgId) }))!;
    expect((await listProjects(org)).map((p) => p.id)).toEqual([projectId]);
    expect((await listContracts(org)).map((c) => c.id)).toEqual([contractId]);
    const board = (await getProjectBoard(org, projectId))!;
    expect(board.events.map((e) => e.reference)).toEqual(["ACH HL-0001"]);
    expect(board.balances).toEqual({ owner_receipts: dollars(50_000), sub_payable: dollars(9_000) });
    const overview = (await projectOverview(org, projectId))!;
    expect(overview.timeline.map((t) => t.type)).toEqual(expect.arrayContaining(["project.created", "contract.created", "document.attached", "owner_payment.recorded"]));
    expect(await getInvitation(token)).toMatchObject({ valid: true, org: { name: "Ironline Steel" } });
    const contract = (await db.query.contracts.findFirst({ where: eq(schema.contracts.id, contractId), with: { document: true, sub: true } }))!;
    expect(contract.document?.byteLength).toBeGreaterThan(0);
    expect(contract.sub.id).not.toBe(ID.org.ironline);
  });

  it("rebuilds the sample workspace from nothing each time", async () => {
    const db = await getDb();
    // Things added inside the sample workspace are part of it and go with it.
    await addSubcontract({ projectId: ID.project.bayview, gcOrgId: ID.org.meridian, subName: "Harbor Painting", trade: "Painting", sumCents: dollars(1_000), filename: "p.pdf", bytes: pdf(), actor: { userId: ID.user.priya, label: "Priya Natarajan" } });
    await resetTo("closeout");
    await resetTo("fresh");
    const demo = await db.query.organizations.findMany({ where: eq(schema.organizations.isDemo, true) });
    expect(demo.map((o) => o.id).sort()).toEqual(SEED.organizations.map((o) => o.id).sort());
    const meridian = demo.find((o) => o.id === ID.org.meridian)!;
    expect((await listContracts(meridian)).map((c) => c.status)).toEqual(["draft", "draft", "draft", "draft"]);
    const sampleProjects = [ID.project.bayview, ID.project.congress];
    expect(await db.query.ledgerEntries.findMany({ where: inArray(schema.ledgerEntries.projectId, sampleProjects) })).toEqual([]);
    expect(await db.query.ownerPaymentEvents.findMany({ where: inArray(schema.ownerPaymentEvents.projectId, sampleProjects) })).toEqual([]);
    expect(await db.query.ruleSets.findMany()).toEqual([]);
    expect(await db.query.releases.findMany()).toEqual([]);
    expect(await db.query.payments.findMany()).toEqual([]);
    // Bank notices for sample payments went with them; the unrelated one stayed.
    expect((await db.select().from(schema.webhookInbox)).map((w) => w.externalEventId)).toEqual(["real-evt-1"]);
    // The audit trail holds only the real company's history.
    const events = await db.query.events.findMany();
    expect(events.every((e) => e.actorUserId === userId)).toBe(true);
    expect(await db.query.users.findMany({ where: eq(schema.users.orgId, ID.org.meridian) })).toHaveLength(3);
  });
});
