"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAuth } from "@/server/auth";
import { getContract, getContractAdjustments } from "@/server/scoped";
import { certifyRetention, decideChangeOrder, proposeChangeOrder, recordBackcharge, voidBackcharge } from "@/server/actions/adjustments";
import { formatCents, parseDollars } from "@/lib/money";
import { acknowledgeAnomaly, approveRuleSet, resolveField } from "@/server/actions/rules";
import { RULE_FIELDS, type RuleFieldPath } from "@/domain/rules/schema";
import { attachContractDocument, UploadError } from "@/server/actions/documents";
import type { StoredRules } from "@/server/rules/review";

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
    // Notes Claude attached to this term were shown with it; settling the term acknowledges them.
    const count = (contract.ruleSets.find((r) => r.id === ruleSetId)?.rules as StoredRules | undefined)?.extracted.anomalies.length ?? 0;
    const acks = [...new Set(formData.getAll("ack").map((v) => Number(v)))].filter((i) => Number.isInteger(i) && i >= 0 && i < count);
    for (const index of acks) {
      await acknowledgeAnomaly({ ruleSetId, index, note: decision === "accept" ? "Read with the term and accepted." : "Read with the term, which was changed.", actor });
    }
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
    await approveRuleSet({ ruleSetId, actor });
    revalidatePath(`/gc/projects/${contract.projectId}`);
    message = "Payment rules approved. Payments on this subcontract now follow them.";
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
    message = `Uploaded ${r.pageCount}-page PDF. Read it to propose payment rules.`;
  } catch (e) {
    if (!(e instanceof UploadError)) throw e;
    message = e.message;
  }
  back(contract.id, message);
}

// ─── Adjustments: backcharges, change orders, retention ─────────────────────

async function adjustmentGuard(formData: FormData) {
  const session = await requireAuth("gc");
  const contractId = String(formData.get("contractId") ?? "");
  const contract = await getContract(session.org, contractId);
  if (!contract) redirect("/gc");
  return { contract, actor: { userId: session.user.id, label: session.user.name } };
}

async function run(contractId: string, projectId: string, ok: string, fn: () => Promise<unknown>) {
  let message = ok;
  try {
    await fn();
  } catch (e) {
    message = sentence((e as Error).message);
  }
  revalidatePath(`/gc/projects/${projectId}`);
  back(contractId, message);
}

const sentence = (s: string) => {
  const t = s.replace(/(\d{3,}) cents/g, (_m, n) => formatCents(Number(n)));
  return t.charAt(0).toUpperCase() + t.slice(1) + (/[.!?]$/.test(t) ? "" : ".");
};

export async function recordBackchargeAction(formData: FormData) {
  const { contract, actor } = await adjustmentGuard(formData);
  const amountCents = parseDollars(formData.get("amount"));
  const noticeDate = String(formData.get("noticeDate") ?? "") || null;
  await run(contract.id, contract.projectId, "Backcharge recorded. It comes off this subcontractor's next payment.", () =>
    recordBackcharge({ contractId: contract.id, amountCents: Number.isNaN(amountCents) ? 0 : amountCents, reason: String(formData.get("reason") ?? ""), noticeDate, actor }),
  );
}

export async function voidBackchargeAction(formData: FormData) {
  const { contract, actor } = await adjustmentGuard(formData);
  const id = String(formData.get("backchargeId") ?? "");
  const adj = await getContractAdjustments((await requireAuth("gc")).org, contract.id);
  if (!adj?.backcharge.rows.some((b) => b.id === id)) back(contract.id, "That backcharge is not on this contract.");
  await run(contract.id, contract.projectId, "Backcharge withdrawn.", () => voidBackcharge({ backchargeId: id, actor }));
}

export async function proposeChangeOrderAction(formData: FormData) {
  const { contract, actor } = await adjustmentGuard(formData);
  const amount = parseDollars(formData.get("amount"));
  const deduct = formData.get("direction") === "deduct";
  await run(contract.id, contract.projectId, "Change order recorded. Approve it to change the contract sum.", () =>
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

export async function decideChangeOrderAction(formData: FormData) {
  const { contract, actor } = await adjustmentGuard(formData);
  const id = String(formData.get("changeOrderId") ?? "");
  const adj = await getContractAdjustments((await requireAuth("gc")).org, contract.id);
  if (!adj?.changeOrders.some((c) => c.id === id)) back(contract.id, "That change order is not on this contract.");
  const approve = formData.get("decision") === "approve";
  await run(contract.id, contract.projectId, approve ? "Change order approved. The contract sum and schedule of values are updated." : "Change order rejected.", () =>
    decideChangeOrder({ changeOrderId: id, decision: approve ? "approve" : "reject", note: String(formData.get("note") ?? "") || undefined, actor }),
  );
}

export async function certifyRetentionAction(formData: FormData) {
  const { contract, actor } = await adjustmentGuard(formData);
  const pct = Number(String(formData.get("percent") ?? "").replace("%", ""));
  await run(contract.id, contract.projectId, "Release condition certified. The retainage is paid out when the owner's retention is received.", () =>
    certifyRetention({ contractId: contract.id, releaseBps: Number.isFinite(pct) ? Math.round(pct * 100) : 0, note: String(formData.get("note") ?? ""), isFinal: formData.get("isFinal") === "on", actor }),
  );
}
