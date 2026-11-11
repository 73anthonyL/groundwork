"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAuth } from "@/server/auth";
import { getRelease } from "@/server/scoped";
import { retryRelease, settleSimulated } from "@/server/actions/payments";

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

export async function retryAction(formData: FormData) {
  const session = await requireAuth("gc");
  const releaseId = String(formData.get("releaseId") ?? "");
  const release = await getRelease(session.org, releaseId);
  if (!release) redirect("/gc");
  let msg = "retried=1";
  try {
    const r = await retryRelease({ releaseId, actor: { userId: session.user.id, label: session.user.name } });
    if (!r.initiated) msg = `error=${encodeURIComponent(r.waitingOn === "lower_tier_waivers" ? "The payment is queued again. It is sent once the suppliers' and sub-subcontractors' waivers are signed." : "The payment is queued again. It is sent once the company paying it has been paid.")}`;
  } catch (e) {
    msg = `error=${encodeURIComponent((e as Error).message)}`;
  }
  revalidatePath(`/gc/releases/${releaseId}`);
  redirect(`/gc/releases/${releaseId}?${msg}`);
}
