"use server";

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { clearSession, createSession, homeFor } from "@/server/auth";

export async function signInAs(formData: FormData) {
  const userId = String(formData.get("userId") ?? "");
  const db = await getDb();
  const rows = await db
    .select({ user: schema.users, org: schema.organizations })
    .from(schema.users)
    .innerJoin(schema.organizations, eq(schema.users.orgId, schema.organizations.id))
    .where(eq(schema.users.id, userId))
    .limit(1);
  const row = rows[0];
  if (!row) redirect("/sign-in?error=unknown-persona");
  await createSession(row.user.id);
  redirect(homeFor(row.org.kind));
}

export async function signOut() {
  await clearSession();
  redirect("/sign-in");
}
