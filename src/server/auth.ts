/**
 * Sessions.
 *
 * Two ways in, one cookie:
 *   - Real accounts sign in with an email and password. The page calls `verifyCredentials` (or
 *     `signUp` / `acceptInvitation`) from src/server/actions and then `createSession(userId)`.
 *   - The sample workspace is entered by picking one of its seeded people, who have no password:
 *     `listSamplePersonas()` and `createSampleSession(userId)`, which refuses anyone outside it.
 *
 * `createSession` trusts its caller: only call it with a user id that one of the functions above
 * has just returned, never with an id taken from a form.
 *
 * The cookie is an HMAC-signed JWT so a client cannot forge another user without SESSION_SECRET.
 * Authorization never trusts the cookie alone: every query goes through org-scoped helpers in
 * ./scoped.ts. The session never carries the password hash.
 */
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import type { Organization, PublicUser } from "@/db/schema";

const COOKIE = "gw_session";

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s && process.env.NODE_ENV === "production") throw new Error("SESSION_SECRET is required in production");
  return new TextEncoder().encode(s ?? "groundwork-dev-only-secret");
}

export type OrgKind = Organization["kind"];
export type Session = { user: PublicUser; org: Organization };

/** Every user column except the password hash. */
const publicUser = {
  id: schema.users.id,
  orgId: schema.users.orgId,
  name: schema.users.name,
  email: schema.users.email,
  title: schema.users.title,
  role: schema.users.role,
  createdAt: schema.users.createdAt,
};

export async function createSession(userId: string) {
  const jwt = await new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secret());
  (await cookies()).set(COOKIE, jwt, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function clearSession() {
  (await cookies()).delete(COOKIE);
}

/** Current user and their company, memoized per request. Null when signed out or the user no longer exists. */
export const auth = cache(async (): Promise<Session | null> => {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  let userId: string | undefined;
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ["HS256"] });
    userId = payload.sub;
  } catch {
    return null;
  }
  if (!userId) return null;
  const db = await getDb();
  const rows = await db
    .select({ user: publicUser, org: schema.organizations })
    .from(schema.users)
    .innerJoin(schema.organizations, eq(schema.users.orgId, schema.organizations.id))
    .where(eq(schema.users.id, userId))
    .limit(1);
  return rows[0] ?? null;
});

/** True when the organization is part of the seeded sample workspace, which a demo reset rebuilds. */
export function isSampleWorkspace(org: Pick<Organization, "isDemo">): boolean {
  return org.isDemo;
}

/** The people of the sample workspace, for the "explore the sample" picker. Real accounts are never listed. */
export async function listSamplePersonas(): Promise<Session[]> {
  const db = await getDb();
  return db
    .select({ user: publicUser, org: schema.organizations })
    .from(schema.users)
    .innerJoin(schema.organizations, eq(schema.users.orgId, schema.organizations.id))
    .where(eq(schema.organizations.isDemo, true))
    .orderBy(schema.organizations.kind, schema.users.createdAt, schema.users.name);
}

/**
 * Password-less sign-in, for sample personas only. Returns the session's user and company, or null
 * (and sets no cookie) when the id is not a person in the sample workspace.
 */
export async function createSampleSession(userId: string): Promise<Session | null> {
  if (!/^[0-9a-f-]{36}$/i.test(userId)) return null;
  const db = await getDb();
  const [row] = await db
    .select({ user: publicUser, org: schema.organizations })
    .from(schema.users)
    .innerJoin(schema.organizations, eq(schema.users.orgId, schema.organizations.id))
    .where(and(eq(schema.users.id, userId), eq(schema.organizations.isDemo, true)))
    .limit(1);
  if (!row) return null;
  await createSession(row.user.id);
  return row;
}

export function homeFor(kind: OrgKind): string {
  switch (kind) {
    case "gc":
      return "/gc";
    case "sub":
      return "/sub";
    case "owner":
      return "/owner";
  }
}

/** Redirects to sign-in when signed out, and to the user's home when the org kind does not match. */
export async function requireAuth(kind?: OrgKind | OrgKind[]): Promise<Session> {
  const session = await auth();
  if (!session) redirect("/sign-in");
  if (kind) {
    const kinds = Array.isArray(kind) ? kind : [kind];
    if (!kinds.includes(session.org.kind)) redirect(homeFor(session.org.kind));
  }
  return session;
}
