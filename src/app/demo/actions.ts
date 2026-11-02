"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { requireAuth } from "@/server/auth";
import { CHECKPOINTS, resetTo, type Checkpoint } from "@/server/demo/reset";
import { getDb, schema } from "@/db/client";
import { settleSimulated } from "@/server/actions/payments";

export async function resetAction(formData: FormData) {
  await requireAuth("gc");
  const to = String(formData.get("to") ?? "fresh") as Checkpoint;
  if (!CHECKPOINTS.includes(to)) redirect("/demo");
  const r = await resetTo(to);
  revalidatePath("/", "layout");
  redirect(`/demo?msg=${encodeURIComponent(`Reset to ${r.checkpoint} in ${r.ms} ms`)}`);
}

export async function settleAllAction() {
  await requireAuth("gc");
  const db = await getDb();
  const released = await db.query.payments.findMany({ where: eq(schema.payments.status, "released") });
  for (const p of released) if (p.rail === "simulated") await settleSimulated(p.id);
  revalidatePath("/", "layout");
  redirect(`/demo?msg=${encodeURIComponent(`Settled ${released.length} payment(s) at the simulated bank`)}`);
}
