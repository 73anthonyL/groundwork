"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAuth } from "@/server/auth";
import { createProject, ProjectInputError, type ProjectField } from "@/server/actions/projects";
import { parseDollars } from "@/lib/money";

export type NewProjectValues = { name: string; address: string; state: string; ownerName: string; sum: string; contractDate: string };
export type NewProjectState = { errors?: Partial<Record<ProjectField, string>>; error?: string; values?: NewProjectValues };

export async function createProjectAction(_prev: NewProjectState, formData: FormData): Promise<NewProjectState> {
  const session = await requireAuth("gc");
  const text = (k: string) => String(formData.get(k) ?? "");
  const values: NewProjectValues = { name: text("name"), address: text("address"), state: text("state"), ownerName: text("ownerName"), sum: text("sum"), contractDate: text("contractDate") };
  const cents = parseDollars(values.sum);
  if (!Number.isInteger(cents) || cents <= 0) return { values, errors: { primeContractSumCents: "Enter the prime contract sum in dollars, for example 4,200,000." } };
  let projectId: string;
  try {
    ({ projectId } = await createProject({
      gcOrgId: session.org.id,
      name: values.name,
      address: values.address,
      state: values.state,
      ownerName: values.ownerName,
      primeContractSumCents: cents,
      contractDate: values.contractDate,
      actor: { userId: session.user.id, label: session.user.name },
    }));
  } catch (e) {
    if (e instanceof ProjectInputError) return e.field ? { values, errors: { [e.field]: e.message } } : { values, error: e.message };
    throw e;
  }
  // The sidebar lists projects, so the whole contractor layout is stale.
  revalidatePath("/gc", "layout");
  redirect(`/gc/projects/${projectId}?created=1`);
}
