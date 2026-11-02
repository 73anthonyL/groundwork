"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAuth } from "@/server/auth";
import { getRelease } from "@/server/scoped";
import { settleSimulated } from "@/server/actions/payments";

export async function settleAction(formData: FormData) {
  const session = await requireAuth("gc");
  const releaseId = String(formData.get("releaseId") ?? "");
  const release = await getRelease(session.org, releaseId);
  if (!release?.payment) redirect(`/gc/releases/${releaseId}`);
  await settleSimulated(release.payment.id);
  revalidatePath(`/gc/releases/${releaseId}`);
  revalidatePath(`/gc/projects/${release.contract.projectId}`);
  redirect(`/gc/releases/${releaseId}?settled=1`);
}
