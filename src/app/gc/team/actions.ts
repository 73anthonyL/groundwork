"use server";

import { revalidatePath } from "next/cache";
import { requireAuth } from "@/server/auth";
import { AccountError } from "@/server/actions/accounts";
import { inviteMember, InvitationError } from "@/server/actions/invitations";
import { gcSubcontractors } from "@/server/read/gc-lists";

export type InviteState = {
  error?: string;
  field?: "email" | "name";
  values?: { email: string; name: string; orgId: string };
  /** The invitation was created; the page lists its link. */
  created?: { email: string; orgName: string };
};

export async function inviteAction(_prev: InviteState, formData: FormData): Promise<InviteState> {
  const session = await requireAuth("gc");
  const text = (k: string) => String(formData.get(k) ?? "").trim();
  const values = { email: text("email"), name: text("name"), orgId: text("orgId") || session.org.id };
  // Into the contractor's own company, or one of its subcontractors. The server checks this again.
  const subs = await gcSubcontractors(session.org);
  const target = values.orgId === session.org.id ? { id: session.org.id, name: session.org.name } : subs.find((s) => s.id === values.orgId);
  if (!target) return { values, error: "Choose a company from the list." };
  if (!values.email) return { values, field: "email", error: "Enter their email address." };
  try {
    const invitation = await inviteMember({ orgId: target.id, email: values.email, name: values.name || undefined, invitedBy: session.user.id });
    revalidatePath("/gc/team");
    revalidatePath("/gc");
    return { created: { email: invitation.email, orgName: target.name } };
  } catch (e) {
    if (e instanceof AccountError) return { values, field: e.field === "name" ? "name" : "email", error: e.message };
    if (e instanceof InvitationError) return { values, field: e.code === "email_taken" ? "email" : undefined, error: e.message };
    throw e;
  }
}
