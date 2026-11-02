"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAuth } from "@/server/auth";
import { getWaiver } from "@/server/scoped";
import { signWaiver } from "@/server/actions/payments";

export type SignState = { error?: string };

export async function signWaiverAction(_prev: SignState, formData: FormData): Promise<SignState> {
  const session = await requireAuth("sub");
  const waiverId = String(formData.get("waiverId") ?? "");
  const waiver = await getWaiver(session.org, waiverId);
  if (!waiver) return { error: "This waiver is not available to you." };
  const signerName = String(formData.get("signerName") ?? "").trim();
  const signerTitle = String(formData.get("signerTitle") ?? "").trim();
  if (signerName.length < 3) return { error: "Type your full name to sign." };
  if (formData.get("attest") !== "on") return { error: "Confirm the statement before signing." };
  try {
    await signWaiver({ waiverId, signerName, signerTitle, actor: { userId: session.user.id, label: session.user.name } });
  } catch (e) {
    return { error: (e as Error).message };
  }
  revalidatePath("/sub");
  revalidatePath(`/sub/contracts/${waiver.contractId}`);
  redirect(`/sub/contracts/${waiver.contractId}?signed=${waiverId}`);
}
