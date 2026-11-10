"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getWaiverByToken } from "@/server/scoped";
import { signWaiver } from "@/server/actions/payments";
import type { SignState } from "@/app/sub/actions";

/** Account-less signing: possession of the link's token is the authorization. */
export async function signByTokenAction(_prev: SignState, formData: FormData): Promise<SignState> {
  const token = String(formData.get("token") ?? "");
  const waiver = await getWaiverByToken(token);
  if (!waiver) return { error: "This signing link is not valid." };
  const signerName = String(formData.get("signerName") ?? "").trim();
  const signerTitle = String(formData.get("signerTitle") ?? "").trim();
  if (signerName.length < 3) return { error: "Type your full name to sign." };
  if (formData.get("attest") !== "on") return { error: "Confirm the statement before signing." };
  try {
    await signWaiver({ waiverId: waiver.id, signerName, signerTitle, actor: { userId: null, label: `${signerName} (${waiver.release.contract.sub.name})` } });
  } catch (e) {
    return { error: (e as Error).message };
  }
  revalidatePath(`/w/${token}`);
  redirect(`/w/${token}?signed=1`);
}
