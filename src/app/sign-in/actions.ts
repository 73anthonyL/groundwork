"use server";

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { clearSession, createSession, homeFor } from "@/server/auth";
import { verifyCredentials } from "@/server/actions/accounts";

export type SignInState = { error?: string; email?: string };

/**
 * Email and password sign-in. A session is only ever created for the user `verifyCredentials`
 * returns; nothing posted by the form names a user. Every failure gets the same message.
 * (Entering the sample workspace without a password lives in src/app/sample/actions.ts.)
 */
export async function signIn(_prev: SignInState, formData: FormData): Promise<SignInState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const user = await verifyCredentials({ email, password });
  if (!user) return { error: "That email and password don't match.", email };
  const db = await getDb();
  const org = await db.query.organizations.findFirst({ where: eq(schema.organizations.id, user.orgId) });
  if (!org) return { error: "That email and password don't match.", email };
  await createSession(user.id);
  redirect(homeFor(org.kind));
}

export async function signOut() {
  await clearSession();
  redirect("/sign-in");
}
