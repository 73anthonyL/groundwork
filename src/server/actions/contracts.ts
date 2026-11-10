/**
 * Adding a subcontract: the front door of the product. The contractor names the subcontractor,
 * gives the contract sum and uploads the signed PDF; the contract starts as a draft with its PDF
 * attached, ready to be read into payment rules.
 */
import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { emit, type Actor } from "@/server/events";
import { now, isoDate } from "@/server/clock";
import { attachContractDocument, inspectPdf, UploadError } from "@/server/actions/documents";

export class ContractInputError extends Error {}

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export async function addSubcontract(input: {
  projectId: string;
  gcOrgId: string;
  subName: string;
  trade: string;
  sumCents: number;
  contactName?: string;
  filename: string;
  bytes: Uint8Array;
  actor: Actor;
}) {
  const subName = input.subName.trim().replace(/\s+/g, " ");
  const trade = input.trade.trim();
  const contactName = input.contactName?.trim() ?? "";
  if (subName.length < 2) throw new ContractInputError("Enter the subcontractor's name.");
  if (trade.length < 2) throw new ContractInputError("Enter the trade or scope of work.");
  if (!Number.isInteger(input.sumCents) || input.sumCents <= 0) throw new ContractInputError("Enter the contract sum in dollars.");
  // Reject an unreadable file before anything is written.
  try {
    await inspectPdf(input.bytes);
  } catch (e) {
    if (e instanceof UploadError) throw new ContractInputError(e.message);
    throw e;
  }

  const db = await getDb();
  const contractId = randomUUID();
  await db.transaction(async (tx) => {
    const project = await tx.query.projects.findFirst({ where: and(eq(schema.projects.id, input.projectId), eq(schema.projects.gcOrgId, input.gcOrgId)) });
    if (!project) throw new ContractInputError("Project not found.");

    // A subcontractor already known by this name keeps its people and history; otherwise it is new.
    let sub = await tx.query.organizations.findFirst({ where: and(eq(schema.organizations.kind, "sub"), sql`lower(${schema.organizations.name}) = ${subName.toLowerCase()}`) });
    if (sub) {
      const existing = await tx.query.contracts.findFirst({ where: and(eq(schema.contracts.projectId, project.id), eq(schema.contracts.subOrgId, sub.id), eq(schema.contracts.gcOrgId, input.gcOrgId)) });
      if (existing) throw new ContractInputError(`${sub.name} already has a subcontract on this project.`);
    } else {
      const orgId = randomUUID();
      const slug = `${slugify(subName)}-${orgId.slice(0, 6)}`;
      [sub] = await tx.insert(schema.organizations).values({ id: orgId, kind: "sub", name: subName, slug }).returning();
      // Someone has to be able to sit in the subcontractor's seat to bill and sign.
      await tx.insert(schema.users).values({ id: randomUUID(), orgId, name: contactName || `${subName} office`, email: `billing@${slug}.example`, title: "Billing contact", role: "admin" });
    }

    await tx.insert(schema.contracts).values({
      id: contractId,
      projectId: project.id,
      gcOrgId: input.gcOrgId,
      subOrgId: sub.id,
      title: `Subcontract — ${trade}`,
      trade,
      contractSumCents: input.sumCents,
      executedOn: isoDate(now()),
      status: "draft",
    });
    // One line for the whole sum, so the subcontractor can bill against it straight away.
    await tx.insert(schema.sovLines).values({ id: randomUUID(), contractId, lineNo: 1, description: trade, scheduledValueCents: input.sumCents });
    await emit(tx, {
      aggregateType: "contract",
      aggregateId: contractId,
      type: "contract.created",
      actor: input.actor,
      payload: { projectId: project.id, subOrgId: sub.id, sumCents: input.sumCents, trade },
      correlationId: contractId,
    });
  });

  await attachContractDocument({ contractId, orgId: input.gcOrgId, filename: input.filename, bytes: input.bytes, actor: input.actor });
  return { contractId };
}
