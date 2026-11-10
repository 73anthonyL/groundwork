"use server";

import { redirect } from "next/navigation";
import { createSession } from "@/server/auth";
import { AccountError, EMAIL_TAKEN_MESSAGE, signUp, type AccountField } from "@/server/actions/accounts";

export type SignUpState = {
  errors?: Partial<Record<AccountField, string>>;
  /** The email already has an account: the form offers a link to sign in. */
  emailTaken?: boolean;
  formError?: string;
  values?: { companyName: string; name: string; email: string };
};

/** Creates a contractor's company and its first person, signs them in and opens their home. */
export async function signUpAction(_prev: SignUpState, formData: FormData): Promise<SignUpState> {
  const values = {
    companyName: String(formData.get("companyName") ?? ""),
    name: String(formData.get("name") ?? ""),
    email: String(formData.get("email") ?? ""),
  };
  let userId: string;
  try {
    ({ userId } = await signUp({ ...values, password: String(formData.get("password") ?? "") }));
  } catch (e) {
    if (e instanceof AccountError) {
      if (e.message === EMAIL_TAKEN_MESSAGE) return { emailTaken: true, values };
      return e.field ? { errors: { [e.field]: e.message }, values } : { formError: e.message, values };
    }
    throw e;
  }
  await createSession(userId);
  redirect("/gc");
}
