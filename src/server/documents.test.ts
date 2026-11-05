import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { ID } from "@/db/seed";
import { resetTo } from "@/server/demo/reset";
import { attachContractDocument } from "@/server/actions/documents";
import { stableId } from "@/lib/ids";

const actor = { userId: ID.user.priya, label: "Priya Natarajan" };
const pdf = new Uint8Array(readFileSync("seed/contracts/ironline-steel.pdf"));

describe("bring-your-own subcontract PDF", () => {
  beforeAll(async () => {
    await resetTo("compiled"); // Ironline approved (active), Summit not compiled
  }, 60_000);

  it("attaches a text PDF to an uncompiled contract and drops the cached-extraction link", async () => {
    const r = await attachContractDocument({ contractId: ID.contract.summit, orgId: ID.org.meridian, filename: "my sub/contract?.pdf", bytes: pdf, actor });
    expect(r.pageCount).toBeGreaterThan(0);
    const db = await getDb();
    const c = await db.query.contracts.findFirst({ where: eq(schema.contracts.id, ID.contract.summit), with: { document: true } });
    expect(c?.documentId).toBe(r.documentId);
    expect(c?.document?.filename).toBe("my sub_contract_.pdf");
    expect(c?.document?.pageTexts?.join(" ")).toMatch(/Ironline/);
    // The route serves the seed spec only for the seeded document id.
    expect(c!.document!.id).not.toBe(stableId(`document:${ID.contract.summit}:${c!.document!.sha256}`));
    const ev = await db.query.events.findFirst({ where: eq(schema.events.type, "document.attached") });
    expect(ev?.aggregateId).toBe(ID.contract.summit);
  });

  it("refuses non-PDFs and contracts whose rules are approved", async () => {
    await expect(attachContractDocument({ contractId: ID.contract.summit, orgId: ID.org.meridian, filename: "x.pdf", bytes: new TextEncoder().encode("hello"), actor })).rejects.toThrow(/not a PDF/);
    await expect(attachContractDocument({ contractId: ID.contract.ironline, orgId: ID.org.meridian, filename: "x.pdf", bytes: pdf, actor })).rejects.toThrow(/frozen/);
  });
});
