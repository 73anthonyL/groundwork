"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAuth } from "@/server/auth";
import { getPayApp } from "@/server/scoped";
import { reviewPayApp } from "@/server/actions/pay-apps";

export async function reviewPayAppAction(formData: FormData) {
  const session = await requireAuth("gc");
  const id = String(formData.get("payAppId") ?? "");
  const app = await getPayApp(session.org, id);
  if (!app) redirect("/gc");
  const decision = String(formData.get("decision") ?? "");
  const note = String(formData.get("note") ?? "").trim() || undefined;
  const actor = { userId: session.user.id, label: session.user.name };
  let error: string | undefined;
  try {
    if (decision === "approve") await reviewPayApp({ payAppId: id, decision: "approve", applyCorrection: false, note, actor });
    else if (decision === "correct_approve") await reviewPayApp({ payAppId: id, decision: "approve", applyCorrection: true, note: note ?? "Corrected to the contract retainage rate.", actor });
    else if (decision === "request_changes") await reviewPayApp({ payAppId: id, decision: "request_changes", note, actor });
  } catch (e) {
    error = (e as Error).message;
  }
  revalidatePath(`/gc/pay-apps/${id}`);
  revalidatePath(`/gc/projects/${app.contract.projectId}`);
  revalidatePath("/gc/pay-apps");
  redirect(`/gc/pay-apps/${id}${error ? `?error=${encodeURIComponent(error)}` : "?done=1"}`);
}
