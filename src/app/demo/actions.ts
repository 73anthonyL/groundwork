"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { homeFor, isSampleWorkspace, requireAuth } from "@/server/auth";
import { CHECKPOINTS, resetTo, type Checkpoint } from "@/server/demo/reset";
import { getDb, schema } from "@/db/client";
import { settleSimulated } from "@/server/actions/payments";

/** Only people of the sample workspace may reset it or settle its payments. */
async function requireSample() {
  const session = await requireAuth();
  if (!isSampleWorkspace(session.org)) redirect(homeFor(session.org.kind));
  return session;
}

export async function resetAction(formData: FormData) {
  await requireSample();
  const to = String(formData.get("to") ?? "fresh") as Checkpoint;
  if (!CHECKPOINTS.includes(to)) redirect("/demo");
  const r = await resetTo(to);
  revalidatePath("/", "layout");
  redirect(`/demo?msg=${encodeURIComponent(`Reset to "${r.checkpoint}" in ${r.ms} ms.`)}`);
}

/**
 * Marks every sent payment in the sample workspace as paid. A payment belongs to the sample
 * workspace when its release's contract is under a sample general contractor; real companies'
 * payments are never touched.
 */
export async function settleAllAction() {
  await requireSample();
  const db = await getDb();
  const released = await db
    .select({ id: schema.payments.id })
    .from(schema.payments)
    .innerJoin(schema.releases, eq(schema.payments.releaseId, schema.releases.id))
    .innerJoin(schema.contracts, eq(schema.releases.contractId, schema.contracts.id))
    .innerJoin(schema.organizations, eq(schema.contracts.gcOrgId, schema.organizations.id))
    .where(and(eq(schema.payments.status, "released"), eq(schema.payments.rail, "simulated"), eq(schema.organizations.isDemo, true)));
  for (const p of released) await settleSimulated(p.id);
  revalidatePath("/", "layout");
  redirect(`/demo?msg=${encodeURIComponent(released.length === 0 ? "No payments were waiting to be marked paid." : `Marked ${released.length} payment${released.length === 1 ? "" : "s"} as paid.`)}`);
}
