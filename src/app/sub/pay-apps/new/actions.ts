"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAuth } from "@/server/auth";
import { getContract } from "@/server/scoped";
import { setPayAppFlags, submitPayApp } from "@/server/actions/pay-apps";
import { flagPayApp } from "@/lib/ai/flagPayApp";
import { dollars } from "@/lib/money";

export type SubmitState = { error?: string };

export async function submitPayAppAction(_prev: SubmitState, formData: FormData): Promise<SubmitState> {
  const session = await requireAuth("sub");
  const contractId = String(formData.get("contractId") ?? "");
  const contract = await getContract(session.org, contractId);
  if (!contract) return { error: "Contract not found." };
  const number = Number(formData.get("number"));
  const periodThrough = String(formData.get("periodThrough") ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(periodThrough)) return { error: "Choose the period-through date." };
  const money = (name: string) => {
    const raw = String(formData.get(name) ?? "").replace(/[$,\s]/g, "");
    if (raw === "") return 0;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? dollars(n) : NaN;
  };
  const lines = contract.sovLines.map((l) => ({ sovLineId: l.id, thisPeriodCents: money(`this_${l.id}`), storedCents: money(`stored_${l.id}`) }));
  if (lines.some((l) => Number.isNaN(l.thisPeriodCents) || Number.isNaN(l.storedCents))) return { error: "Amounts must be numbers." };
  if (!lines.some((l) => l.thisPeriodCents > 0 || l.storedCents > 0)) return { error: "Bill at least one line." };
  const retainageBilledCents = money("retainage");
  const previouslyBilledCents = money("previouslyBilled");
  if (Number.isNaN(retainageBilledCents) || Number.isNaN(previouslyBilledCents)) return { error: "Amounts must be numbers." };
  let result: Awaited<ReturnType<typeof submitPayApp>>;
  try {
    result = await submitPayApp({
      contractId,
      number,
      periodThrough,
      isFinal: formData.get("isFinal") === "on",
      lines,
      retainageBilledCents,
      previouslyBilledCents,
      actor: { userId: session.user.id, label: session.user.name },
    });
  } catch (e) {
    return { error: (e as Error).message };
  }
  // Claude phrases the non-passing checks for the reviewer. Best effort; never blocks submission.
  try {
    const active = contract.ruleSets.find((r) => r.status === "approved");
    const retainageBps = active ? ((active.rules as { extracted?: { retainage?: { percent_bps?: { value?: number | null } } } }).extracted?.retainage?.percent_bps?.value ?? null) : null;
    const flags = await flagPayApp({ subName: session.org.name, number, checks: result.checks, rules: active ? { retainageBps } : null });
    if (flags.length) await setPayAppFlags(result.id, flags);
  } catch (e) {
    console.warn("flagPayApp failed", (e as Error).message);
  }
  revalidatePath(`/sub/contracts/${contractId}`);
  revalidatePath(`/gc/projects/${contract.projectId}`);
  redirect(`/sub/contracts/${contractId}?submitted=${result.id}`);
}
