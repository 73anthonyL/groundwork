"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAuth } from "@/server/auth";
import { getRelease } from "@/server/scoped";
import { explainRelease } from "@/server/actions/explain";

export async function explainAction(formData: FormData) {
  const session = await requireAuth("sub");
  const releaseId = String(formData.get("releaseId") ?? "");
  const release = await getRelease(session.org, releaseId);
  if (!release) redirect("/sub");
  await explainRelease(releaseId);
  revalidatePath(`/sub/contracts/${release.contractId}`);
  redirect(`/sub/contracts/${release.contractId}#release-${releaseId}`);
}
