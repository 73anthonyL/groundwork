/** Adding a subcontract from an uploaded PDF: what gets created, and what is refused before anything is written. */
import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { ID } from "@/db/seed";
import { resetTo } from "@/server/demo/reset";
import { addSubcontract, ContractInputError } from "@/server/actions/contracts";
import { dollars } from "@/lib/money";

const GC = { userId: ID.user.priya, label: "Priya Natarajan" };
const pdf = () => new Uint8Array(readFileSync("evals/contracts/adv-days-in-words-only.pdf"));
const base = () => ({ projectId: ID.project.bayview, gcOrgId: ID.org.meridian, trade: "Painting", sumCents: dollars(150_000), filename: "harbor painting.pdf", bytes: pdf(), actor: GC });

describe("adding a subcontract", () => {
  beforeAll(async () => {
    await resetTo("fresh");
  }, 60_000);

  it("creates the subcontractor, a seat for them, a draft contract with one billable line, and attaches the PDF", async () => {
    const db = await getDb();
    const { contractId } = await addSubcontract({ ...base(), subName: "  Harbor   Painting ", contactName: "Lena Ortiz" });
    const contract = (await db.query.contracts.findFirst({ where: eq(schema.contracts.id, contractId), with: { sub: true, sovLines: true } }))!;
    expect(contract).toMatchObject({ status: "draft", trade: "Painting", contractSumCents: dollars(150_000), projectId: ID.project.bayview, gcOrgId: ID.org.meridian });
    expect(contract.sub).toMatchObject({ name: "Harbor Painting", kind: "sub" });
    expect(contract.sovLines).toHaveLength(1);
    expect(contract.sovLines[0].scheduledValueCents).toBe(dollars(150_000));
    expect(contract.documentId).not.toBeNull();
    const doc = (await db.query.documents.findFirst({ where: eq(schema.documents.id, contract.documentId!) }))!;
    expect(doc.pageCount).toBeGreaterThan(0);
    const people = await db.query.users.findMany({ where: eq(schema.users.orgId, contract.subOrgId) });
    expect(people.map((u) => u.name)).toEqual(["Lena Ortiz"]);
  });

  it("refuses a second subcontract for the same subcontractor on the project, whatever the capitalisation", async () => {
    await expect(addSubcontract({ ...base(), subName: "harbor painting" })).rejects.toThrow(/already has a subcontract/);
    await expect(addSubcontract({ ...base(), subName: "Ironline Steel" })).rejects.toThrow(/already has a subcontract/);
  });

  it("writes nothing when the file is not a readable PDF or the facts are missing", async () => {
    const db = await getDb();
    const before = (await db.query.contracts.findMany()).length;
    const orgsBefore = (await db.query.organizations.findMany()).length;
    await expect(addSubcontract({ ...base(), subName: "Tidewater Roofing", bytes: new TextEncoder().encode("not a pdf") })).rejects.toThrow(ContractInputError);
    await expect(addSubcontract({ ...base(), subName: "Tidewater Roofing", sumCents: NaN })).rejects.toThrow(/contract sum/);
    await expect(addSubcontract({ ...base(), subName: "T" })).rejects.toThrow(/name/);
    await expect(addSubcontract({ ...base(), subName: "Tidewater Roofing", gcOrgId: ID.org.ironline })).rejects.toThrow(/Project not found/);
    expect((await db.query.contracts.findMany()).length).toBe(before);
    expect((await db.query.organizations.findMany()).length).toBe(orgsBefore);
  });
});
