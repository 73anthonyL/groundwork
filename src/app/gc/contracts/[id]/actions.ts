"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAuth } from "@/server/auth";
import { getContract } from "@/server/scoped";
import { acknowledgeAnomaly, approveRuleSet, resolveField } from "@/server/actions/rules";
import { RULE_FIELDS, type RuleFieldPath } from "@/domain/rules/schema";
import { attachContractDocument, UploadError } from "@/server/actions/documents";

function parseOverride(path: RuleFieldPath, raw: string): unknown {
  const v = raw.trim();
  switch (path) {
    case "timing.days":
    case "retainage.release_days":
      return Number(v);
    case "retainage.percent_bps":
    case "retainage.cap_bps":
      return Math.round(Number(v.replace("%", "")) * 100); // percent → bps
    case "timing.agreed_in_writing":
    case "waivers.conditional_before_progress":
    case "waivers.unconditional_after_payment":
    case "waivers.lower_tier_required":
    case "waivers.statutory_form_required":
    case "offsets.joint_check":
    case "offsets.backcharge_setoff":
    case "offsets.withhold_defective":
    case "stored_materials":
      return v === "true" || v === "yes" || v === "on";
    default:
      return v;
  }
}

async function guard(formData: FormData) {
  const session = await requireAuth("gc");
  const contractId = String(formData.get("contractId") ?? "");
  const contract = await getContract(session.org, contractId);
  if (!contract) redirect("/gc");
  const ruleSetId = String(formData.get("ruleSetId") ?? "");
  if (!contract.ruleSets.some((r) => r.id === ruleSetId)) redirect(`/gc/contracts/${contractId}`);
  return { session, contract, ruleSetId, actor: { userId: session.user.id, label: session.user.name } };
}

function back(contractId: string, msg?: string) {
  revalidatePath(`/gc/contracts/${contractId}`);
  redirect(`/gc/contracts/${contractId}${msg ? `?msg=${encodeURIComponent(msg)}` : ""}`);
}

export async function resolveFieldAction(formData: FormData) {
  const { contract, ruleSetId, actor } = await guard(formData);
  const path = String(formData.get("path") ?? "") as RuleFieldPath;
  if (!RULE_FIELDS.includes(path)) back(contract.id, "Unknown field.");
  const decision = formData.get("decision") === "override" ? "override" : "accept";
  const note = String(formData.get("note") ?? "").trim();
  const value = decision === "override" ? parseOverride(path, String(formData.get("value") ?? "")) : undefined;
  let error: string | undefined;
  try {
    await resolveField({ ruleSetId, path, decision, value, note: note || (decision === "accept" ? "Accepted as read." : "Overridden."), actor });
  } catch (e) {
    error = (e as Error).message;
  }
  back(contract.id, error);
}

export async function acknowledgeAnomalyAction(formData: FormData) {
  const { contract, ruleSetId, actor } = await guard(formData);
  const index = Number(formData.get("index"));
  const note = String(formData.get("note") ?? "").trim() || "Acknowledged.";
  let error: string | undefined;
  try {
    await acknowledgeAnomaly({ ruleSetId, index, note, actor });
  } catch (e) {
    error = (e as Error).message;
  }
  back(contract.id, error);
}

export async function approveRuleSetAction(formData: FormData) {
  const { contract, ruleSetId, actor } = await guard(formData);
  let message: string;
  try {
    const r = await approveRuleSet({ ruleSetId, actor });
    revalidatePath(`/gc/projects/${contract.projectId}`);
    message = `Approved and frozen · sha256 ${r.hash.slice(0, 12)}…`;
  } catch (e) {
    message = (e as Error).message;
  }
  back(contract.id, message);
}

export async function uploadContractPdfAction(formData: FormData) {
  const session = await requireAuth("gc");
  const contractId = String(formData.get("contractId") ?? "");
  const contract = await getContract(session.org, contractId);
  if (!contract) redirect("/gc");
  const file = formData.get("file");
  let message: string;
  try {
    if (!(file instanceof File)) throw new UploadError("Choose a PDF to upload.");
    const r = await attachContractDocument({
      contractId,
      orgId: session.org.id,
      filename: file.name,
      bytes: new Uint8Array(await file.arrayBuffer()),
      actor: { userId: session.user.id, label: session.user.name },
    });
    message = `Uploaded ${r.pageCount}-page PDF. Compile it with Claude to propose rules.`;
  } catch (e) {
    if (!(e instanceof UploadError)) throw e;
    message = e.message;
  }
  back(contract.id, message);
}
