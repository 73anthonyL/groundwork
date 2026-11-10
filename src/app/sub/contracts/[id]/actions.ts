"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAuth } from "@/server/auth";
import { getContract, getRelease } from "@/server/scoped";
import { proposeChangeOrder } from "@/server/actions/adjustments";
import { addLowerTierParty } from "@/server/actions/lower-tier";
import { parseDollars } from "@/lib/money";
import { explainRelease } from "@/server/actions/explain";

export async function explainAction(formData: FormData) {
  const session = await requireAuth("sub");
  const releaseId = String(formData.get("releaseId") ?? "");
  const release = await getRelease(session.org, releaseId);
  if (!release) redirect("/sub");
  await explainRelease(releaseId);
  revalidatePath(`/sub/contracts/${release.contractId}`);
  redirect(`/sub/contracts/${release.contractId}#release-${releaseId}`);
}

async function contractGuard(formData: FormData) {
  const session = await requireAuth("sub");
  const contractId = String(formData.get("contractId") ?? "");
  const contract = await getContract(session.org, contractId);
  if (!contract) redirect("/sub");
  return { contract, actor: { userId: session.user.id, label: session.user.name } };
}

async function finish(contractId: string, projectId: string, ok: string, fn: () => Promise<unknown>) {
  let msg = ok;
  try {
    await fn();
  } catch (e) {
    const m = (e as Error).message;
    msg = m.charAt(0).toUpperCase() + m.slice(1) + (/[.!?]$/.test(m) ? "" : ".");
  }
  revalidatePath(`/sub/contracts/${contractId}`);
  revalidatePath(`/gc/contracts/${contractId}`);
  revalidatePath(`/gc/projects/${projectId}`);
  redirect(`/sub/contracts/${contractId}?msg=${encodeURIComponent(msg)}`);
}

export async function requestChangeOrderAction(formData: FormData) {
  const { contract, actor } = await contractGuard(formData);
  const amount = parseDollars(formData.get("amount"));
  const deduct = formData.get("direction") === "deduct";
  await finish(contract.id, contract.projectId, `Change order request sent to ${contract.project.gc.name}.`, () =>
    proposeChangeOrder({
      contractId: contract.id,
      title: String(formData.get("title") ?? ""),
      description: String(formData.get("description") ?? "") || null,
      amountCents: Number.isNaN(amount) ? 0 : deduct ? -Math.abs(amount) : Math.abs(amount),
      sovLineId: deduct ? String(formData.get("sovLineId") ?? "") || null : null,
      actor,
    }),
  );
}

export async function addLowerTierAction(formData: FormData) {
  const { contract, actor } = await contractGuard(formData);
  const sum = parseDollars(formData.get("sum"));
  const daysRaw = String(formData.get("days") ?? "").trim();
  const days = daysRaw === "" ? null : Number(daysRaw);
  await finish(contract.id, contract.projectId, "Added. Declare what you owe them on your next pay application.", () =>
    addLowerTierParty({
      parentContractId: contract.id,
      name: String(formData.get("name") ?? ""),
      kind: formData.get("kind") === "subcontractor" ? "subcontractor" : "supplier",
      scope: String(formData.get("scope") ?? ""),
      sumCents: Number.isNaN(sum) ? 0 : sum,
      timingDays: days !== null && Number.isInteger(days) && days >= 0 ? days : null,
      actor,
    }),
  );
}
