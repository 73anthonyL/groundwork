"use server";

import { revalidatePath } from "next/cache";
import { requireAuth } from "@/server/auth";
import { AccountError } from "@/server/actions/accounts";
import { inviteMember, InvitationError } from "@/server/actions/invitations";

export type InviteState = {
  error?: string;
  field?: "email" | "name";
  values?: { email: string; name: string };
  /** The invitation was created; the page lists its link. */
  created?: { email: string };
};

/** Invite a teammate into the signed-in subcontractor's own company. Nothing is emailed: the link is copied from the page. */
export async function inviteTeammateAction(_prev: InviteState, formData: FormData): Promise<InviteState> {
  const session = await requireAuth("sub");
  const text = (k: string) => String(formData.get(k) ?? "").trim();
  const values = { email: text("email"), name: text("name") };
  if (!values.email) return { values, field: "email", error: "Enter their email address." };
  try {
    // Always the caller's own company: the target is never taken from the form.
    const invitation = await inviteMember({ orgId: session.org.id, email: values.email, name: values.name || undefined, invitedBy: session.user.id });
    revalidatePath("/sub/company");
    return { created: { email: invitation.email } };
  } catch (e) {
    if (e instanceof AccountError) return { values, field: e.field === "name" ? "name" : "email", error: e.message };
    if (e instanceof InvitationError) return { values, field: e.code === "email_taken" ? "email" : undefined, error: e.message };
    throw e;
  }
}
