"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAuth } from "@/server/auth";
import { getProject } from "@/server/scoped";
import { recordOwnerPayment } from "@/server/actions/owner-payment";
import { addSubcontract, ContractInputError } from "@/server/actions/contracts";
import { dollars, parseDollars } from "@/lib/money";

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
  const retentionRaw = String(formData.get("retention") ?? "").trim();
  const retentionCents = retentionRaw === "" ? 0 : parseDollars(retentionRaw);
  if (Number.isNaN(retentionCents) || retentionCents < 0) return { error: "The retention amount is not valid." };
  if (retentionCents > dollars(amount)) return { error: "The retention portion cannot be more than the payment." };
  const result = await recordOwnerPayment({
    projectId,
    amountCents: dollars(amount),
    receivedAt,
    periodThrough,
    reference,
    retentionCents,
    actor: { userId: session.user.id, label: session.user.name },
  });
  revalidatePath(`/gc/projects/${projectId}`);
  redirect(`/gc/projects/${projectId}?event=${result.eventId}${result.duplicate ? "&duplicate=1" : ""}`);
}

export type AddSubcontractState = { error?: string };

export async function addSubcontractAction(_prev: AddSubcontractState, formData: FormData): Promise<AddSubcontractState> {
  const session = await requireAuth("gc");
  const projectId = String(formData.get("projectId") ?? "");
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose the subcontract PDF." };
  let contractId: string;
  try {
    ({ contractId } = await addSubcontract({
      projectId,
      gcOrgId: session.org.id,
      subName: String(formData.get("subName") ?? ""),
      trade: String(formData.get("trade") ?? ""),
      sumCents: parseDollars(formData.get("sum")),
      contactName: String(formData.get("contactName") ?? ""),
      filename: file.name,
      bytes: new Uint8Array(await file.arrayBuffer()),
      actor: { userId: session.user.id, label: session.user.name },
    }));
  } catch (e) {
    if (e instanceof ContractInputError) return { error: e.message };
    throw e;
  }
  revalidatePath(`/gc/projects/${projectId}`);
  redirect(`/gc/contracts/${contractId}?read=1`);
}
