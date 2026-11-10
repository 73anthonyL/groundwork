/**
 * Invitations: how a second person gets an account. A member invites an email address into an
 * organization; the invitee opens the link, chooses a password and is signed up into that company.
 *
 * There is no email service. Nothing is sent: the inviter copies the link from `listInvitations`
 * in src/server/scoped.ts and passes it on themselves. The token in the link is the credential,
 * works once and expires after INVITATION_DAYS.
 */
import { randomBytes, randomUUID } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db/client";
import type { Invitation, Organization, User } from "@/db/schema";
import type { DbLike } from "@/server/db-types";
import { hashPassword } from "@/server/passwords";
import { EMAIL_TAKEN_MESSAGE, emailSchema, isUniqueViolation, parseAccountInput, passwordSchema, personNameSchema } from "@/server/actions/accounts";

export const INVITATION_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

export type InvitationErrorCode = "forbidden" | "sample_workspace" | "email_taken" | "not_found" | "expired" | "accepted";

/** An invitation that cannot be created or used. `message` is safe to show. */
export class InvitationError extends Error {
  constructor(
    message: string,
    readonly code: InvitationErrorCode,
  ) {
    super(message);
    this.name = "InvitationError";
  }
}

export type InvitationStatus = "pending" | "accepted" | "expired";

export function invitationStatus(i: Pick<Invitation, "acceptedAt" | "expiresAt">, at: Date = new Date()): InvitationStatus {
  return i.acceptedAt ? "accepted" : i.expiresAt.getTime() <= at.getTime() ? "expired" : "pending";
}

/** Where the accept page lives. The pages must serve this route. */
export function invitationPath(token: string): string {
  return `/invite/${token}`;
}

const inviteSchema = z.object({ email: emailSchema, name: personNameSchema.optional(), role: z.enum(schema.userRole.enumValues).default("admin") });

/**
 * Who may invite into `org`: a member of that organization, or a member of a general contractor
 * that has a subcontract with it (a subcontractor) or a project it pays for (an owner).
 */
async function mayInvite(tx: DbLike, inviter: User, inviterOrg: Organization, org: Organization): Promise<boolean> {
  if (inviter.orgId === org.id) return true;
  if (inviterOrg.kind !== "gc") return false;
  if (org.kind === "sub") {
    const [c] = await tx.select({ id: schema.contracts.id }).from(schema.contracts).where(and(eq(schema.contracts.gcOrgId, inviterOrg.id), eq(schema.contracts.subOrgId, org.id))).limit(1);
    return !!c;
  }
  if (org.kind === "owner") {
    const [p] = await tx.select({ id: schema.projects.id }).from(schema.projects).where(and(eq(schema.projects.gcOrgId, inviterOrg.id), eq(schema.projects.ownerOrgId, org.id))).limit(1);
    return !!p;
  }
  return false;
}

/**
 * Creates an invitation inside the caller's transaction. Exported for actions that invite as part
 * of something larger (adding a subcontract); everything else should call `inviteMember`.
 */
export async function createInvitation(tx: DbLike, input: { orgId: string; email: string; name?: string; role?: User["role"]; invitedBy: string }): Promise<Invitation> {
  const v = parseAccountInput(inviteSchema, { email: input.email, name: input.name?.trim() ? input.name : undefined, role: input.role });
  const inviter = await tx.query.users.findFirst({ where: eq(schema.users.id, input.invitedBy), with: { org: true } });
  const org = await tx.query.organizations.findFirst({ where: eq(schema.organizations.id, input.orgId) });
  // One answer for "no such company" and "not yours to invite into", so ids cannot be probed.
  if (!inviter || !org || !(await mayInvite(tx, inviter, inviter.org, org))) throw new InvitationError("You can't invite people to that company.", "forbidden");
  // Accounts made in the sample workspace are erased whenever it is reset, and would hold a real email hostage until then.
  if (org.isDemo || inviter.org.isDemo) throw new InvitationError("Invitations are turned off in the sample workspace.", "sample_workspace");

  const existing = await tx.query.users.findFirst({ where: eq(schema.users.email, v.email) });
  // A placeholder in the same company (no password yet) is the one case where the email may already exist.
  if (existing && (existing.passwordHash || existing.orgId !== org.id)) {
    throw new InvitationError(existing.orgId === org.id ? "That person already has an account at this company." : "That email already belongs to a Groundwork account.", "email_taken");
  }
  // A new invitation replaces any unused one for the same person, so only the newest link works.
  await tx.delete(schema.invitations).where(and(eq(schema.invitations.orgId, org.id), eq(schema.invitations.email, v.email), isNull(schema.invitations.acceptedAt)));
  const at = new Date();
  const [row] = await tx
    .insert(schema.invitations)
    .values({
      id: randomUUID(),
      token: randomBytes(32).toString("base64url"),
      orgId: org.id,
      email: v.email,
      name: v.name?.replace(/\s+/g, " ") ?? null,
      role: v.role,
      invitedByUserId: inviter.id,
      createdAt: at,
      expiresAt: new Date(at.getTime() + INVITATION_DAYS * DAY_MS),
    })
    .returning();
  return row;
}

/**
 * Invites an email address into an organization. `invitedBy` is the inviting user's id and decides
 * what is allowed (see `mayInvite`). Returns the invitation, including the token for its link.
 * Throws AccountError for a bad email or name, InvitationError when it is not allowed.
 */
export async function inviteMember(input: { orgId: string; email: string; name?: string; role?: User["role"]; invitedBy: string }): Promise<Invitation> {
  const db = await getDb();
  return db.transaction((tx) => createInvitation(tx, input));
}

export type InvitationView = {
  status: InvitationStatus;
  /** True only while the invitation can still be accepted. */
  valid: boolean;
  email: string;
  name: string | null;
  role: User["role"];
  org: { id: string; name: string; kind: Organization["kind"] };
  invitedBy: { name: string; orgName: string };
  expiresAt: Date;
};

/** For the accept page: who invited whom into which company, and whether the link still works. Null when there is no such invitation. */
export async function getInvitation(token: string): Promise<InvitationView | null> {
  if (typeof token !== "string" || !TOKEN_RE.test(token)) return null;
  const db = await getDb();
  const row = await db.query.invitations.findFirst({ where: eq(schema.invitations.token, token), with: { org: true, invitedBy: { columns: { name: true }, with: { org: { columns: { name: true } } } } } });
  if (!row) return null;
  const status = invitationStatus(row);
  return {
    status,
    valid: status === "pending",
    email: row.email,
    name: row.name,
    role: row.role,
    org: { id: row.org.id, name: row.org.name, kind: row.org.kind },
    invitedBy: { name: row.invitedBy.name, orgName: row.invitedBy.org.name },
    expiresAt: row.expiresAt,
  };
}

const acceptSchema = z.object({ name: personNameSchema, password: passwordSchema });

/**
 * Accepts an invitation: creates the person in the inviting company (or gives the placeholder for
 * that email a password), and uses the invitation up. Follow with `createSession(userId)`.
 * Throws AccountError for a bad name or password, InvitationError when the link is unknown, used or expired.
 */
export async function acceptInvitation(input: { token: string; name: string; password: string }): Promise<{ userId: string; orgId: string }> {
  const v = parseAccountInput(acceptSchema, { name: input.name, password: input.password });
  if (typeof input.token !== "string" || !TOKEN_RE.test(input.token)) throw new InvitationError("This invitation link is not valid.", "not_found");
  const passwordHash = await hashPassword(v.password);
  const db = await getDb();
  try {
    return await db.transaction(async (tx) => {
      const at = new Date();
      // Claiming the row is the single-use guard: of two requests with one token, only one update matches.
      const [inv] = await tx
        .update(schema.invitations)
        .set({ acceptedAt: at })
        .where(and(eq(schema.invitations.token, input.token), isNull(schema.invitations.acceptedAt), gt(schema.invitations.expiresAt, at)))
        .returning();
      if (!inv) {
        const seen = await tx.query.invitations.findFirst({ where: eq(schema.invitations.token, input.token) });
        if (!seen) throw new InvitationError("This invitation link is not valid.", "not_found");
        if (seen.acceptedAt) throw new InvitationError("This invitation has already been used. Sign in instead.", "accepted");
        throw new InvitationError("This invitation has expired. Ask for a new one.", "expired");
      }
      const name = v.name.replace(/\s+/g, " ");
      const existing = await tx.query.users.findFirst({ where: eq(schema.users.email, inv.email) });
      if (existing) {
        if (existing.passwordHash || existing.orgId !== inv.orgId) throw new InvitationError(EMAIL_TAKEN_MESSAGE, "email_taken");
        await tx.update(schema.users).set({ name, passwordHash, role: inv.role }).where(eq(schema.users.id, existing.id));
        return { userId: existing.id, orgId: inv.orgId };
      }
      const userId = randomUUID();
      await tx.insert(schema.users).values({ id: userId, orgId: inv.orgId, name, email: inv.email, role: inv.role, passwordHash });
      return { userId, orgId: inv.orgId };
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw new InvitationError(EMAIL_TAKEN_MESSAGE, "email_taken");
    throw e;
  }
}
