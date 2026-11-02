"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAuth } from "@/server/auth";
import { getProject } from "@/server/scoped";
import { recordOwnerPayment } from "@/server/actions/owner-payment";
import { dollars } from "@/lib/money";

export type RecordState = { error?: string; ok?: boolean };

export async function recordOwnerPaymentAction(_prev: RecordState, formData: FormData): Promise<RecordState> {
  const session = await requireAuth("gc");
  const projectId = String(formData.get("projectId") ?? "");
  const project = await getProject(session.org, projectId);
  if (!project) return { error: "Project not found." };
  const amount = Number(String(formData.get("amount") ?? "").replace(/[$,\s]/g, ""));
  if (!Number.isFinite(amount) || amount <= 0) return { error: "Enter the amount the owner paid." };
  const reference = String(formData.get("reference") ?? "").trim();
  if (!reference) return { error: "Enter the bank reference so this payment is idempotent." };
  const periodThrough = String(formData.get("periodThrough") ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(periodThrough)) return { error: "Choose the period the payment covers." };
  const receivedRaw = String(formData.get("receivedAt") ?? "");
  const receivedAt = receivedRaw ? new Date(receivedRaw) : new Date();
  if (Number.isNaN(receivedAt.getTime())) return { error: "Received date is not valid." };
  const result = await recordOwnerPayment({
    projectId,
    amountCents: dollars(amount),
    receivedAt,
    periodThrough,
    reference,
    includesRetention: formData.get("includesRetention") === "on",
    actor: { userId: session.user.id, label: session.user.name },
  });
  revalidatePath(`/gc/projects/${projectId}`);
  redirect(`/gc/projects/${projectId}?event=${result.eventId}${result.duplicate ? "&duplicate=1" : ""}`);
}
