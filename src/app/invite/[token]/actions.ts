"use server";

import { redirect } from "next/navigation";
import { createSession, homeFor } from "@/server/auth";
import { AccountError } from "@/server/actions/accounts";
import { InvitationError, acceptInvitation, getInvitation } from "@/server/actions/invitations";

export type AcceptState = {
  errors?: { name?: string; password?: string };
  formError?: string;
  /** The invitation was used or the email has an account: the form offers a link to sign in. */
  signIn?: boolean;
  name?: string;
};

/** Accepts the invitation in the link, signs the new person in and opens their company's home. */
export async function acceptAction(token: string, _prev: AcceptState, formData: FormData): Promise<AcceptState> {
  const name = String(formData.get("name") ?? "");
  const invitation = await getInvitation(token);
  if (!invitation) return { formError: "This invitation link is not valid.", name };
  let userId: string;
  try {
    ({ userId } = await acceptInvitation({ token, name, password: String(formData.get("password") ?? "") }));
  } catch (e) {
    if (e instanceof AccountError) {
      return e.field === "name" || e.field === "password" ? { errors: { [e.field]: e.message }, name } : { formError: e.message, name };
    }
    if (e instanceof InvitationError) return { formError: e.message, signIn: e.code === "accepted" || e.code === "email_taken", name };
    throw e;
  }
  await createSession(userId);
  redirect(homeFor(invitation.org.kind));
}
