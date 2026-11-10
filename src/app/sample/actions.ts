"use server";

import { redirect } from "next/navigation";
import { createSampleSession, homeFor } from "@/server/auth";

/**
 * Enters the sample workspace as one of its seeded people. `createSampleSession` refuses any id
 * that is not a person in the sample workspace, so this can never open a real account.
 */
export async function enterSample(formData: FormData) {
  const session = await createSampleSession(String(formData.get("userId") ?? ""));
  if (!session) redirect("/sample?error=1");
  redirect(homeFor(session.org.kind));
}
