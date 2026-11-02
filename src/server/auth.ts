/**
 * Persona sessions.
 *
 * Users are seeded; signing in picks a persona. The cookie is an HMAC-signed JWT so a client cannot
 * forge another persona without SESSION_SECRET. Authorization never trusts the cookie alone: every
 * query goes through org-scoped helpers in ./scoped.ts.
 *
 * Production swap path: replace createSession/auth with an IdP (Clerk/WorkOS) and keep scoped.ts as is.
 */
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import type { Organization, User } from "@/db/schema";

const COOKIE = "gw_session";

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s && process.env.NODE_ENV === "production") throw new Error("SESSION_SECRET is required in production");
  return new TextEncoder().encode(s ?? "groundwork-dev-only-secret");
}

export type OrgKind = Organization["kind"];
export type Session = { user: User; org: Organization };

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

/** Current persona, memoized per request. Null when signed out or the user no longer exists. */
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
    .select({ user: schema.users, org: schema.organizations })
    .from(schema.users)
    .innerJoin(schema.organizations, eq(schema.users.orgId, schema.organizations.id))
    .where(eq(schema.users.id, userId))
    .limit(1);
  return rows[0] ?? null;
});

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

/** Redirects to sign-in when signed out, and to the persona's home when the org kind does not match. */
export async function requireAuth(kind?: OrgKind | OrgKind[]): Promise<Session> {
  const session = await auth();
  if (!session) redirect("/sign-in");
  if (kind) {
    const kinds = Array.isArray(kind) ? kind : [kind];
    if (!kinds.includes(session.org.kind)) redirect(homeFor(session.org.kind));
  }
  return session;
}
