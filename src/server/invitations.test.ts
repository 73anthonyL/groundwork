/** Invitations: who may invite whom, and that a link works once, for fourteen days, for one person. */
import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import type { Organization } from "@/db/schema";
import { ID, seedBaseline } from "@/db/seed";
import { AccountError, signUp, verifyCredentials } from "@/server/actions/accounts";
import { createProject } from "@/server/actions/projects";
import { addSubcontract } from "@/server/actions/contracts";
import { acceptInvitation, getInvitation, InvitationError, INVITATION_DAYS, inviteMember } from "@/server/actions/invitations";
import { getContract, listContracts, listInvitations, listMembers } from "@/server/scoped";
import { dollars } from "@/lib/money";

const PASSWORD = "a long password";
const pdf = () => new Uint8Array(readFileSync("evals/contracts/adv-days-in-words-only.pdf"));
const org = async (id: string) => (await (await getDb()).query.organizations.findFirst({ where: eq(schema.organizations.id, id) }))!;

let kim: string, rae: string; // users
let keel: Organization, rival: Organization, owner: Organization, sub: Organization;
let projectId: string, contractId: string, subToken: string;

beforeAll(async () => {
  await seedBaseline(await getDb());
  const a = await signUp({ companyName: "Keel Builders", name: "Kim Keel", email: "kim@keelbuilders.com", password: PASSWORD });
  const b = await signUp({ companyName: "Rival Builders", name: "Rae Rival", email: "rae@rivalbuilders.com", password: PASSWORD });
  [kim, rae] = [a.userId, b.userId];
  [keel, rival] = [await org(a.orgId), await org(b.orgId)];
  const p = await createProject({ gcOrgId: keel.id, name: "Harbor Lofts", address: "12 Pier Road", state: "CA", ownerName: "Harbor Holdings", primeContractSumCents: dollars(3_000_000), contractDate: "2026-03-01", actor: { userId: kim, label: "Kim Keel" } });
  projectId = p.projectId;
  owner = await org(p.ownerOrgId);
});

describe("adding a subcontract with a contact email", () => {
  it("invites the contact instead of creating a placeholder, and returns the token for the link", async () => {
    const r = await addSubcontract({ projectId, gcOrgId: keel.id, subName: "Tidewater Roofing", trade: "Roofing", sumCents: dollars(90_000), contactName: "Tess Tide", contactEmail: " Tess@TidewaterRoofing.com ", filename: "roofing.pdf", bytes: pdf(), actor: { userId: kim, label: "Kim Keel" } });
    contractId = r.contractId;
    subToken = r.invitationToken!;
    expect(subToken).toMatch(/^[\w-]{43}$/);
    sub = await org(r.subOrgId);
    expect(sub).toMatchObject({ kind: "sub", name: "Tidewater Roofing", isDemo: false });
    expect(await listMembers(sub)).toEqual([]);
    const view = (await getInvitation(subToken))!;
    expect(view).toMatchObject({ status: "pending", valid: true, email: "tess@tidewaterroofing.com", name: "Tess Tide", role: "admin", org: { id: sub.id, name: "Tidewater Roofing", kind: "sub" }, invitedBy: { name: "Kim Keel", orgName: "Keel Builders" } });
    const days = (view.expiresAt.getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(INVITATION_DAYS - 0.01);
    expect(days).toBeLessThanOrEqual(INVITATION_DAYS);
  });

  it("still creates the placeholder billing contact when no email is given", async () => {
    const r = await addSubcontract({ projectId, gcOrgId: keel.id, subName: "Anchor Glazing", trade: "Glazing", sumCents: dollars(40_000), filename: "glazing.pdf", bytes: pdf(), actor: { userId: kim, label: "Kim Keel" } });
    expect(r.invitationToken).toBeNull();
    expect(await listMembers(await org(r.subOrgId))).toEqual([expect.objectContaining({ name: "Anchor Glazing office", hasPassword: false })]);
  });

  it("refuses a bad contact email before anything is written", async () => {
    const before = (await listContracts(keel)).length;
    const bad = { projectId, gcOrgId: keel.id, subName: "Mast Electric", trade: "Electrical", sumCents: dollars(10_000), filename: "e.pdf", bytes: pdf(), actor: { userId: kim, label: "Kim Keel" } };
    await expect(addSubcontract({ ...bad, contactEmail: "nope" })).rejects.toThrow(/real email address/);
    // An email that already belongs to someone at another company: the whole subcontract is rolled back.
    await expect(addSubcontract({ ...bad, contactEmail: "rae@rivalbuilders.com" })).rejects.toThrow(/another company/);
    expect((await listContracts(keel)).length).toBe(before);
    expect(await (await getDb()).query.organizations.findFirst({ where: eq(schema.organizations.name, "Mast Electric") })).toBeUndefined();
  });

  it("does not attach to another contractor's subcontractor of the same name", async () => {
    const rp = await createProject({ gcOrgId: rival.id, name: "Rival Tower", state: "TX", ownerName: "Harbor Holdings", primeContractSumCents: dollars(1_000_000), contractDate: "2026-04-01", actor: { userId: rae, label: "Rae Rival" } });
    const r = await addSubcontract({ projectId: rp.projectId, gcOrgId: rival.id, subName: "tidewater roofing", trade: "Roofing", sumCents: dollars(5_000), filename: "r.pdf", bytes: pdf(), actor: { userId: rae, label: "Rae Rival" } });
    expect(r.subOrgId).not.toBe(sub.id);
    // So the rival gains no right to invite into the first contractor's subcontractor.
    await expect(inviteMember({ orgId: sub.id, email: "mole@rivalbuilders.com", invitedBy: rae })).rejects.toMatchObject({ code: "forbidden" });
  });

  it("in the sample workspace, keeps the placeholder and sends no invitation", async () => {
    const r = await addSubcontract({ projectId: ID.project.bayview, gcOrgId: ID.org.meridian, subName: "Harbor Painting", trade: "Painting", sumCents: dollars(1_000), contactEmail: "lena@harborpainting.com", filename: "p.pdf", bytes: pdf(), actor: { userId: ID.user.priya, label: "Priya Natarajan" } });
    expect(r.invitationToken).toBeNull();
    expect((await org(r.subOrgId)).isDemo).toBe(true);
    expect(await listMembers(await org(r.subOrgId))).toHaveLength(1);
  });
});

describe("who may invite", () => {
  it("a contractor's person may invite into their own company, a subcontractor they have a contract with, and the owner of one of their projects", async () => {
    const own = await inviteMember({ orgId: keel.id, email: "Pat@KeelBuilders.com", name: "Pat Keel", role: "pm", invitedBy: kim });
    expect(own).toMatchObject({ orgId: keel.id, email: "pat@keelbuilders.com", name: "Pat Keel", role: "pm", invitedByUserId: kim, acceptedAt: null });
    expect(own.token).toMatch(/^[\w-]{43}$/);
    expect((await inviteMember({ orgId: sub.id, email: "tom@tidewaterroofing.com", invitedBy: kim })).orgId).toBe(sub.id);
    expect((await inviteMember({ orgId: owner.id, email: "olive@harborholdings.com", invitedBy: kim })).orgId).toBe(owner.id);
  });

  it("nobody may invite into a company they have no tie to", async () => {
    const forbidden = { code: "forbidden", message: "You can't invite people to that company." };
    // Another contractor's company, subcontractor and owner.
    await expect(inviteMember({ orgId: keel.id, email: "x@rivalbuilders.com", invitedBy: rae })).rejects.toMatchObject(forbidden);
    await expect(inviteMember({ orgId: sub.id, email: "x@rivalbuilders.com", invitedBy: rae })).rejects.toMatchObject(forbidden);
    await expect(inviteMember({ orgId: owner.id, email: "x@rivalbuilders.com", invitedBy: rae })).rejects.toMatchObject(forbidden);
    // A company or person that does not exist reads the same.
    await expect(inviteMember({ orgId: "00000000-0000-4000-8000-000000000000", email: "x@rivalbuilders.com", invitedBy: rae })).rejects.toMatchObject(forbidden);
    await expect(inviteMember({ orgId: keel.id, email: "x@rivalbuilders.com", invitedBy: "00000000-0000-4000-8000-000000000000" })).rejects.toMatchObject(forbidden);
  });

  it("a subcontractor's person may invite a colleague, but not into the contractor or the owner", async () => {
    const { userId: tess } = await acceptInvitation({ token: subToken, name: "Tess Tide", password: PASSWORD });
    expect((await inviteMember({ orgId: sub.id, email: "tia@tidewaterroofing.com", invitedBy: tess })).orgId).toBe(sub.id);
    await expect(inviteMember({ orgId: keel.id, email: "t2@tidewaterroofing.com", invitedBy: tess })).rejects.toMatchObject({ code: "forbidden" });
    await expect(inviteMember({ orgId: owner.id, email: "t2@tidewaterroofing.com", invitedBy: tess })).rejects.toMatchObject({ code: "forbidden" });
  });

  it("invitations are off in the sample workspace", async () => {
    await expect(inviteMember({ orgId: ID.org.meridian, email: "new@meridianbuilders.com", invitedBy: ID.user.priya })).rejects.toMatchObject({ code: "sample_workspace" });
    await expect(inviteMember({ orgId: ID.org.ironline, email: "new@ironlinesteel.com", invitedBy: ID.user.priya })).rejects.toMatchObject({ code: "sample_workspace" });
    // A real contractor has no tie to a sample company at all.
    await expect(inviteMember({ orgId: ID.org.ironline, email: "new@ironlinesteel.com", invitedBy: kim })).rejects.toMatchObject({ code: "forbidden" });
  });

  it("refuses an email that already has an account, and a bad email", async () => {
    await expect(inviteMember({ orgId: keel.id, email: "rae@rivalbuilders.com", invitedBy: kim })).rejects.toMatchObject({ code: "email_taken" });
    await expect(inviteMember({ orgId: keel.id, email: "kim@keelbuilders.com", invitedBy: kim })).rejects.toMatchObject({ code: "email_taken", message: expect.stringMatching(/at this company/) });
    await expect(inviteMember({ orgId: keel.id, email: "nope", invitedBy: kim })).rejects.toThrow(AccountError);
  });
});

describe("accepting", () => {
  it("the accepted contact can sign in and sees their company's contract and nothing else", async () => {
    const tess = (await verifyCredentials({ email: "tess@tidewaterroofing.com", password: PASSWORD }))!;
    expect(tess).toMatchObject({ orgId: sub.id, name: "Tess Tide", role: "admin" });
    expect((await listContracts(sub)).map((c) => c.id)).toEqual([contractId]);
    expect(await getContract(rival, contractId)).toBeNull();
  });

  it("works once", async () => {
    expect(await getInvitation(subToken)).toMatchObject({ status: "accepted", valid: false });
    await expect(acceptInvitation({ token: subToken, name: "Someone Else", password: "another password" })).rejects.toMatchObject({ code: "accepted" });
    expect(await verifyCredentials({ email: "tess@tidewaterroofing.com", password: "another password" })).toBeNull();
    expect(await listMembers(sub)).toHaveLength(1);
  });

  it("two people racing for one link: exactly one gets in", async () => {
    const inv = await inviteMember({ orgId: keel.id, email: "race@keelbuilders.com", invitedBy: kim });
    const results = await Promise.allSettled([acceptInvitation({ token: inv.token, name: "First", password: PASSWORD }), acceptInvitation({ token: inv.token, name: "Second", password: PASSWORD })]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((results.find((r) => r.status === "rejected") as PromiseRejectedResult).reason).toBeInstanceOf(InvitationError);
    expect(await (await getDb()).query.users.findMany({ where: eq(schema.users.email, "race@keelbuilders.com") })).toHaveLength(1);
  });

  it("expires after fourteen days", async () => {
    const db = await getDb();
    const inv = await inviteMember({ orgId: keel.id, email: "late@keelbuilders.com", invitedBy: kim });
    // Thirteen days and 23 hours in: still good. A minute past fourteen days: not.
    const age = (ms: number) => db.update(schema.invitations).set({ createdAt: new Date(Date.now() - ms), expiresAt: new Date(Date.now() - ms + INVITATION_DAYS * 86_400_000) }).where(eq(schema.invitations.id, inv.id));
    await age(INVITATION_DAYS * 86_400_000 - 3_600_000);
    expect(await getInvitation(inv.token)).toMatchObject({ status: "pending", valid: true });
    await age(INVITATION_DAYS * 86_400_000 + 60_000);
    expect(await getInvitation(inv.token)).toMatchObject({ status: "expired", valid: false });
    await expect(acceptInvitation({ token: inv.token, name: "Late Larry", password: PASSWORD })).rejects.toMatchObject({ code: "expired" });
    expect(await db.query.users.findFirst({ where: eq(schema.users.email, "late@keelbuilders.com") })).toBeUndefined();
    // Inviting again makes a fresh link and retires the old one.
    const again = await inviteMember({ orgId: keel.id, email: "late@keelbuilders.com", invitedBy: kim });
    expect(await getInvitation(inv.token)).toBeNull();
    expect((await acceptInvitation({ token: again.token, name: "Late Larry", password: PASSWORD })).orgId).toBe(keel.id);
  });

  it("an unknown or malformed token is not found, and a weak password is refused without using the link up", async () => {
    expect(await getInvitation("x")).toBeNull();
    expect(await getInvitation("A".repeat(43))).toBeNull();
    await expect(acceptInvitation({ token: "A".repeat(43), name: "No One", password: PASSWORD })).rejects.toMatchObject({ code: "not_found" });
    const inv = await inviteMember({ orgId: keel.id, email: "weak@keelbuilders.com", invitedBy: kim });
    await expect(acceptInvitation({ token: inv.token, name: "Weak", password: "short" })).rejects.toMatchObject({ field: "password" });
    await expect(acceptInvitation({ token: inv.token, name: " ", password: PASSWORD })).rejects.toMatchObject({ field: "name" });
    expect(await getInvitation(inv.token)).toMatchObject({ valid: true });
  });

  it("gives a placeholder billing contact a password instead of making a second person", async () => {
    const db = await getDb();
    const glazing = (await db.query.organizations.findFirst({ where: eq(schema.organizations.name, "Anchor Glazing") }))!;
    const [placeholder] = await listMembers(glazing);
    // The placeholder's address is not a real one, so point it at the address being invited.
    await db.update(schema.users).set({ email: "gil@anchorglazing.com" }).where(eq(schema.users.id, placeholder.id));
    const inv = await inviteMember({ orgId: glazing.id, email: "gil@anchorglazing.com", invitedBy: kim });
    const { userId } = await acceptInvitation({ token: inv.token, name: "Gil Anchor", password: PASSWORD });
    expect(userId).toBe(placeholder.id);
    expect(await listMembers(glazing)).toEqual([expect.objectContaining({ id: placeholder.id, name: "Gil Anchor", hasPassword: true })]);
    expect(await verifyCredentials({ email: "gil@anchorglazing.com", password: PASSWORD })).toMatchObject({ id: placeholder.id });
  });

  it("an invitation cannot be used once its email has an account elsewhere", async () => {
    const inv = await inviteMember({ orgId: keel.id, email: "sam@elsewhere.com", invitedBy: kim });
    await signUp({ companyName: "Elsewhere Inc", name: "Sam", email: "sam@elsewhere.com", password: PASSWORD });
    await expect(acceptInvitation({ token: inv.token, name: "Sam", password: PASSWORD })).rejects.toMatchObject({ code: "email_taken" });
    expect(await getInvitation(inv.token)).toMatchObject({ status: "pending" });
  });
});

describe("the inviter's list", () => {
  it("shows what the company sent, with a link only while it is open, and nothing another company sent", async () => {
    const mine = await listInvitations(keel);
    const row = (email: string) => mine.find((i) => i.email === email)!;
    expect(row("pat@keelbuilders.com")).toMatchObject({ status: "pending", org: { id: keel.id }, invitedBy: { id: kim, name: "Kim Keel" }, path: expect.stringMatching(/^\/invite\/[\w-]{43}$/) });
    expect(row("tess@tidewaterroofing.com")).toMatchObject({ status: "accepted", org: { id: sub.id, kind: "sub" }, path: null });
    expect(row("olive@harborholdings.com")).toMatchObject({ status: "pending", org: { id: owner.id, kind: "owner" } });
    expect(mine.every((i) => !("token" in i))).toBe(true);
    // The subcontractor sees the invitation its own person sent, not the contractor's links into it.
    expect((await listInvitations(sub)).map((i) => i.email)).toEqual(["tia@tidewaterroofing.com"]);
    expect(await listInvitations(rival)).toEqual([]);
    const db = await getDb();
    const pending = await db.query.invitations.findMany({ where: and(eq(schema.invitations.orgId, keel.id), eq(schema.invitations.email, "pat@keelbuilders.com")) });
    expect(pending).toHaveLength(1);
  });
});
