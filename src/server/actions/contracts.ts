/**
 * Adding a subcontract: the front door of the product. The contractor names the subcontractor,
 * gives the contract sum and uploads the signed PDF; the contract starts as a draft with its PDF
 * attached, ready to be read into payment rules.
 *
 * With a `contactEmail` the subcontractor's contact is invited to make their own account, and the
 * returned `invitationToken` is the link to pass on (there is no email service). Without one, a
 * placeholder billing contact holds the subcontractor's seat, as in the sample workspace.
 */
import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { emit, type Actor } from "@/server/events";
import { now, isoDate } from "@/server/clock";
import { attachContractDocument, inspectPdf, UploadError } from "@/server/actions/documents";
import { AccountError, emailSchema, slugify } from "@/server/actions/accounts";
import { createInvitation, InvitationError } from "@/server/actions/invitations";

export class ContractInputError extends Error {}

export async function addSubcontract(input: {
  projectId: string;
  gcOrgId: string;
  subName: string;
  trade: string;
  sumCents: number;
  contactName?: string;
  /** Invite this person into the subcontractor's company. Ignored in the sample workspace, where invitations are off. */
  contactEmail?: string;
  filename: string;
  bytes: Uint8Array;
  actor: Actor;
}): Promise<{ contractId: string; subOrgId: string; invitationToken: string | null }> {
  const subName = input.subName.trim().replace(/\s+/g, " ");
  const trade = input.trade.trim();
  const contactName = input.contactName?.trim() ?? "";
  if (subName.length < 2) throw new ContractInputError("Enter the subcontractor's name.");
  if (trade.length < 2) throw new ContractInputError("Enter the trade or scope of work.");
  if (!Number.isInteger(input.sumCents) || input.sumCents <= 0) throw new ContractInputError("Enter the contract sum in dollars.");
  let contactEmail: string | null = null;
  if (input.contactEmail?.trim()) {
    const parsed = emailSchema.safeParse(input.contactEmail);
    if (!parsed.success) throw new ContractInputError("Enter a real email address for the subcontractor's contact, or leave it empty.");
    contactEmail = parsed.data;
  }
  // Reject an unreadable file before anything is written.
  try {
    await inspectPdf(input.bytes);
  } catch (e) {
    if (e instanceof UploadError) throw new ContractInputError(e.message);
    throw e;
  }

  const db = await getDb();
  const contractId = randomUUID();
  const { subOrgId, invitationToken } = await db.transaction(async (tx) => {
    const project = await tx.query.projects.findFirst({ where: and(eq(schema.projects.id, input.projectId), eq(schema.projects.gcOrgId, input.gcOrgId)), with: { gc: true } });
    if (!project) throw new ContractInputError("Project not found.");

    // A subcontractor this contractor already works with, by name, keeps its people and history;
    // otherwise it is new. Another contractor's subcontractor of the same name is a separate record,
    // so naming a company never grants a way into someone else's.
    const [known] = await tx
      .select({ org: schema.organizations })
      .from(schema.contracts)
      .innerJoin(schema.organizations, eq(schema.contracts.subOrgId, schema.organizations.id))
      .where(and(eq(schema.contracts.gcOrgId, input.gcOrgId), eq(schema.organizations.kind, "sub"), sql`lower(${schema.organizations.name}) = ${subName.toLowerCase()}`))
      .limit(1);
    let sub = known?.org;
    const invite = contactEmail !== null && !project.gc.isDemo;
    if (sub) {
      const existing = await tx.query.contracts.findFirst({ where: and(eq(schema.contracts.projectId, project.id), eq(schema.contracts.subOrgId, sub.id), eq(schema.contracts.gcOrgId, input.gcOrgId)) });
      if (existing) throw new ContractInputError(`${sub.name} already has a subcontract on this project.`);
    } else {
      const orgId = randomUUID();
      const slug = `${slugify(subName)}-${orgId.slice(0, 6)}`;
      [sub] = await tx.insert(schema.organizations).values({ id: orgId, kind: "sub", name: subName, slug, isDemo: project.gc.isDemo }).returning();
      // Someone has to be able to sit in the subcontractor's seat to bill and sign. An invited contact
      // takes it when they accept; otherwise a placeholder billing contact holds it.
      if (!invite) await tx.insert(schema.users).values({ id: randomUUID(), orgId, name: contactName || `${subName} office`, email: `billing@${slug}.example`, title: "Billing contact", role: "admin" });
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

    // Last, so the contract that gives this contractor the right to invite already exists.
    let invitationToken: string | null = null;
    if (invite) {
      if (!input.actor.userId) throw new ContractInputError("Sign in to invite the subcontractor's contact.");
      const member = await tx.query.users.findFirst({ where: and(eq(schema.users.email, contactEmail!), eq(schema.users.orgId, sub.id)), columns: { passwordHash: true } });
      // Someone who already has an account at this subcontractor needs no invitation.
      if (!member?.passwordHash) {
        try {
          invitationToken = (await createInvitation(tx, { orgId: sub.id, email: contactEmail!, name: contactName || undefined, invitedBy: input.actor.userId })).token;
        } catch (e) {
          if (e instanceof InvitationError || e instanceof AccountError) throw new ContractInputError(e instanceof InvitationError && e.code === "email_taken" ? "That contact's email already belongs to an account at another company. Use a different email or leave it empty." : e.message);
          throw e;
        }
      }
    }
    return { subOrgId: sub.id, invitationToken };
  });

  await attachContractDocument({ contractId, orgId: input.gcOrgId, filename: input.filename, bytes: input.bytes, actor: input.actor });
  return { contractId, subOrgId, invitationToken };
}
