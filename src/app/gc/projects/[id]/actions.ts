"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { requireAuth } from "@/server/auth";
import { getProject } from "@/server/scoped";
import { recordOwnerPayment } from "@/server/actions/owner-payment";
import { addSubcontract, ContractInputError } from "@/server/actions/contracts";
import { invitationPath } from "@/server/actions/invitations";
import { parseDollars } from "@/lib/money";
import { isCalendarDate } from "@/server/clock";

export type RecordField = "amount" | "reference" | "periodThrough" | "receivedAt" | "retention";
export type RecordState = { error?: string; field?: RecordField; values?: Partial<Record<RecordField, string>>; ok?: boolean };

export async function recordOwnerPaymentAction(_prev: RecordState, formData: FormData): Promise<RecordState> {
  const session = await requireAuth("gc");
  const projectId = String(formData.get("projectId") ?? "");
  const text = (k: RecordField) => String(formData.get(k) ?? "").trim();
  const values = { amount: text("amount"), reference: text("reference"), periodThrough: text("periodThrough"), receivedAt: text("receivedAt"), retention: text("retention") };
  const fail = (field: RecordField | undefined, error: string): RecordState => ({ error, field, values });
  const project = await getProject(session.org, projectId);
  if (!project) return fail(undefined, "Project not found.");
  const amountCents = parseDollars(values.amount);
  if (!Number.isInteger(amountCents) || amountCents <= 0) return fail("amount", "Enter the amount the owner paid, in dollars.");
  if (!values.reference) return fail("reference", "Enter the bank reference. Groundwork uses it to avoid recording the same payment twice.");
  if (!isCalendarDate(values.periodThrough)) return fail("periodThrough", "Choose the last day of work this payment covers.");
  const receivedAt = values.receivedAt ? new Date(values.receivedAt) : new Date();
  if (Number.isNaN(receivedAt.getTime())) return fail("receivedAt", "Enter the date and time the payment arrived, or leave it blank to use now.");
  const retentionCents = values.retention === "" ? 0 : parseDollars(values.retention);
  if (Number.isNaN(retentionCents) || retentionCents < 0) return fail("retention", "Enter the retainage amount in dollars, or leave it blank.");
  if (retentionCents > amountCents) return fail("retention", "The retainage released cannot be more than the whole payment.");
  const result = await recordOwnerPayment({
    projectId,
    amountCents,
    receivedAt,
    periodThrough: values.periodThrough,
    reference: values.reference,
    retentionCents,
    actor: { userId: session.user.id, label: session.user.name },
  });
  revalidatePath(`/gc/projects/${projectId}`);
  revalidatePath("/gc");
  redirect(`/gc/projects/${projectId}?event=${result.eventId}${result.duplicate ? "&duplicate=1" : ""}`);
}

export type AddSubcontractState = {
  error?: string;
  values?: { subName: string; trade: string; sum: string; contactName: string; contactEmail: string };
  /** The subcontract was added and its contact invited: show the link before moving on. */
  invited?: { contractId: string; subName: string; email: string; url: string };
};

export async function addSubcontractAction(_prev: AddSubcontractState, formData: FormData): Promise<AddSubcontractState> {
  const session = await requireAuth("gc");
  const projectId = String(formData.get("projectId") ?? "");
  const text = (k: string) => String(formData.get(k) ?? "").trim();
  const values = { subName: text("subName"), trade: text("trade"), sum: text("sum"), contactName: text("contactName"), contactEmail: text("contactEmail") };
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { values, error: "Choose the subcontract PDF." };
  let contractId: string;
  let invitationToken: string | null;
  try {
    ({ contractId, invitationToken } = await addSubcontract({
      projectId,
      gcOrgId: session.org.id,
      subName: values.subName,
      trade: values.trade,
      sumCents: parseDollars(values.sum),
      contactName: values.contactName,
      contactEmail: values.contactEmail || undefined,
      filename: file.name,
      bytes: new Uint8Array(await file.arrayBuffer()),
      actor: { userId: session.user.id, label: session.user.name },
    }));
  } catch (e) {
    if (e instanceof ContractInputError) return { values, error: e.message };
    throw e;
  }
  if (invitationToken) {
    // No revalidation here: the form may be sitting on the project overview, and refreshing that page
    // now would replace the form (and this invite link) before the person has copied it. Every page
    // is rendered per request, so the next navigation shows the new subcontract anyway.
    const h = await headers();
    const origin = h.get("origin") ?? `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host") ?? "localhost:3000"}`;
    return { invited: { contractId, subName: values.subName, email: values.contactEmail, url: `${origin}${invitationPath(invitationToken)}` } };
  }
  revalidatePath(`/gc/projects/${projectId}`);
  revalidatePath("/gc");
  redirect(`/gc/contracts/${contractId}?read=1`);
}
