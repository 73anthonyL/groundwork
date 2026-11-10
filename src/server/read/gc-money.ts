/**
 * Reads for the contractor's money pages: pay apps and payments across projects, where each pay-app
 * check comes from, and what has happened to one payment.
 *
 * Every function takes the caller's organization. The lists return only the contractor's own
 * subcontracts (a subcontractor's lower tier is that subcontractor's to manage). The two detail
 * reads go through `getPayApp` / `getRelease`, so they answer for whoever may see that row and
 * return null for everyone else.
 */
import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import type { Organization } from "@/db/schema";
import { getPayApp, getRelease } from "@/server/scoped";
import { fieldLabel, type StoredRules } from "@/server/rules/review";
import { getField, RULE_FIELDS, type RuleFieldPath } from "@/domain/rules/schema";
import { formatRuleValue, RULE_IDS } from "@/domain/rules/format";
import { statute } from "@/domain/statutes";
import type { Check } from "@/domain/payapp/checks";

const { contracts, payApplications, releases, events, users, ruleSets } = schema;

/** Ids of the subcontracts this contractor holds directly, optionally in one project. */
async function ownContractIds(org: Organization, projectId?: string): Promise<string[]> {
  if (org.kind !== "gc") return [];
  const db = await getDb();
  const rows = await db
    .select({ id: contracts.id })
    .from(contracts)
    .where(and(eq(contracts.gcOrgId, org.id), isNull(contracts.parentContractId), projectId ? eq(contracts.projectId, projectId) : undefined));
  return rows.map((r) => r.id);
}

// ─── Pay apps ───────────────────────────────────────────────────────────────

export type PayAppRow = {
  id: string;
  number: number;
  periodThrough: string;
  isFinal: boolean;
  status: string;
  /** Work this period plus stored materials, as billed. */
  billedCents: number;
  /** Net due: as approved once reviewed, as billed until then. */
  netDueCents: number;
  /** Requirements that failed when the pay app was checked. */
  failing: number;
  submittedAt: Date | null;
  contractId: string;
  subName: string;
  projectId: string;
  projectName: string;
};

/** Pay apps the contractor has received (drafts stay with the subcontractor), newest first. */
export async function listPayApps(org: Organization, projectId?: string): Promise<PayAppRow[]> {
  const ids = await ownContractIds(org, projectId);
  if (!ids.length) return [];
  const db = await getDb();
  const rows = await db.query.payApplications.findMany({
    where: inArray(payApplications.contractId, ids),
    with: { contract: { with: { sub: true, project: true } } },
    orderBy: [desc(payApplications.submittedAt), desc(payApplications.number)],
  });
  return rows
    .filter((a) => a.status !== "draft")
    .map((a) => ({
      id: a.id,
      number: a.number,
      periodThrough: a.periodThrough,
      isFinal: a.isFinal,
      status: a.status,
      billedCents: a.workThisPeriodCents + a.storedMaterialsCents,
      netDueCents: a.netDueApprovedCents ?? a.netDueBilledCents,
      failing: (a.checks as Check[]).filter((c) => c.status === "fail").length,
      submittedAt: a.submittedAt,
      contractId: a.contractId,
      subName: a.contract.sub.name,
      projectId: a.contract.projectId,
      projectName: a.contract.project.name,
    }))
    .sort((a, b) => (b.submittedAt?.getTime() ?? 0) - (a.submittedAt?.getTime() ?? 0) || b.number - a.number);
}

// ─── Payments ───────────────────────────────────────────────────────────────

export type PaymentRow = {
  id: string;
  status: string;
  kind: string;
  payAppNumber: number | null;
  releaseCents: number;
  payByAt: Date | null;
  contractId: string;
  subName: string;
  projectId: string;
  projectName: string;
  /** The owner payment this one was split from. */
  ownerPayment: { id: string; receivedAt: Date; reference: string };
};

/** A payment that has not reached the subcontractor yet. A failed bank payment is still owed. */
export const paymentOpen = (r: { status: string; releaseCents: number }) => r.status !== "paid" && r.status !== "settled" && r.releaseCents > 0;

/** Every payment from the contractor to one of its subcontractors, newest owner payment first. */
export async function listPayments(org: Organization, projectId?: string): Promise<PaymentRow[]> {
  const ids = await ownContractIds(org, projectId);
  if (!ids.length) return [];
  const db = await getDb();
  const rows = await db.query.releases.findMany({
    where: inArray(releases.contractId, ids),
    with: { event: true, payApplication: true, contract: { with: { sub: true, project: true } } },
    orderBy: [desc(releases.createdAt)],
  });
  return rows
    .map((r) => ({
      id: r.id,
      status: r.status,
      kind: r.kind,
      payAppNumber: r.payApplication?.number ?? null,
      releaseCents: r.releaseCents,
      payByAt: r.payByAt,
      contractId: r.contractId,
      subName: r.contract.sub.name,
      projectId: r.contract.projectId,
      projectName: r.contract.project.name,
      ownerPayment: { id: r.event.id, receivedAt: r.event.receivedAt, reference: r.event.reference },
    }))
    .sort((a, b) => b.ownerPayment.receivedAt.getTime() - a.ownerPayment.receivedAt.getTime() || a.subName.localeCompare(b.subName));
}

// ─── One payment: what happened ─────────────────────────────────────────────

export type PaymentLogEntry = { type: string; actor: string; at: string };
export type PaymentLog = {
  /** Who recorded the owner payment this one came from. */
  recordedBy: string | null;
  /** When the split was worked out. */
  plannedAt: string;
  /** Recorded steps, oldest first: waiver.signed, payment.initiated, payment.failed, payment.retried, payment.paid, release.settled. */
  entries: PaymentLogEntry[];
};

/**
 * The recorded history of one payment, for its timeline. Carries only who and when: no amounts and
 * no bank reference, so the same log is safe to show the subcontractor being paid.
 */
export async function paymentLog(org: Organization, releaseId: string): Promise<PaymentLog | null> {
  const release = await getRelease(org, releaseId);
  if (!release) return null;
  const db = await getDb();
  const rows = await db.query.events.findMany({
    where: and(eq(events.aggregateType, "release"), eq(events.aggregateId, releaseId)),
    orderBy: [asc(events.createdAt)],
  });
  const recorder = release.event.recordedBy ? await db.query.users.findFirst({ where: eq(users.id, release.event.recordedBy), columns: { name: true } }) : null;
  return {
    recordedBy: recorder?.name ?? null,
    plannedAt: release.createdAt.toISOString(),
    entries: rows.map((e) => ({ type: e.type, actor: e.actorLabel, at: e.createdAt.toISOString() })),
  };
}

// ─── Where a figure comes from ──────────────────────────────────────────────

export type CheckSource =
  /** A term of the approved payment rules, with the clause it was read from. */
  | { kind: "clause"; term: string; ruleId: string | null; value: string; quote: string | null; page: number | null; changedBy: string | null }
  /** A statute applied on top of the contract. */
  | { kind: "statute"; cite: string; summary: string }
  /** A record Groundwork holds: the schedule of values, earlier pay apps, the pay app's own figures. */
  | { kind: "record"; text: string };

/** A term of an approved rule set as a source: its value as applied (after any correction) and the clause it was read from. */
function clauseSource(stored: StoredRules, path: RuleFieldPath): CheckSource {
  const f = getField(stored.extracted, path);
  const a = stored.annotations[path];
  const value = a.review.override ? a.review.override.value : f.not_found ? null : f.value;
  return {
    kind: "clause",
    term: fieldLabel(path),
    ruleId: RULE_IDS[path] ?? null,
    value: value === null || value === undefined ? "Not stated" : formatRuleValue(path, value),
    quote: f.evidence?.quote ?? null,
    page: a.verification.page ?? f.evidence?.page ?? null,
    changedBy: a.review.override?.by ?? null,
  };
}

/**
 * The subcontract terms behind one payment's figures and deadline, each with its clause. `paths` are
 * the rule paths the engine recorded on the payment; unknown ones are dropped.
 */
export async function paymentSources(org: Organization, releaseId: string, paths: string[]): Promise<CheckSource[]> {
  const release = await getRelease(org, releaseId);
  if (!release?.contract.activeRuleSetId) return [];
  const db = await getDb();
  const active = await db.query.ruleSets.findFirst({ where: and(eq(ruleSets.id, release.contract.activeRuleSetId), eq(ruleSets.contractId, release.contractId)) });
  if (!active) return [];
  const stored = active.rules as StoredRules;
  return [...new Set(paths)].filter((p): p is RuleFieldPath => RULE_FIELDS.includes(p as RuleFieldPath)).map((p) => clauseSource(stored, p));
}

export type PayAppReview = {
  app: NonNullable<Awaited<ReturnType<typeof getPayApp>>>;
  /** The approved rules behind the checks, or null when the subcontract has none. */
  rules: { version: number; approvedBy: string | null; approvedAt: Date | null } | null;
  /** Sources by check id. A check may have more than one (a clause and the statute that caps it). */
  sources: Record<string, CheckSource[]>;
  reviewedBy: string | null;
};

/** A pay app with the source of every requirement it was checked against. */
export async function getPayAppReview(org: Organization, payAppId: string): Promise<PayAppReview | null> {
  const app = await getPayApp(org, payAppId);
  if (!app) return null;
  const db = await getDb();
  const contract = app.contract;
  const active = contract.activeRuleSetId ? await db.query.ruleSets.findFirst({ where: and(eq(ruleSets.id, contract.activeRuleSetId), eq(ruleSets.contractId, contract.id)) }) : null;
  const name = async (id: string | null | undefined) => (id ? ((await db.query.users.findFirst({ where: eq(users.id, id), columns: { name: true } }))?.name ?? null) : null);

  const stored = active ? (active.rules as StoredRules) : null;
  const record = (text: string): CheckSource => ({ kind: "record", text });
  const prior = contract.sovLines.length;

  const retainage: CheckSource[] = [];
  if (stored) {
    retainage.push(clauseSource(stored, "retainage.percent_bps"));
    const cap = stored.overlay.retentionCapBps;
    const capId = stored.overlay.cites?.retentionCap ?? (stored.overlay.state === "CA" ? "CA_CIV_8811" : undefined);
    if (cap !== null && capId) retainage.push({ kind: "statute", cite: statute(capId).cite, summary: statute(capId).summary });
  }

  const sources: Record<Check["id"], CheckSource[]> = {
    rules_approved: [
      record(
        active
          ? `Payment rules version ${active.version} for this subcontract${active.approvedAt ? `, approved ${active.approvedAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}` : ""}.`
          : "No payment rules have been approved for this subcontract.",
      ),
    ],
    line_math: [record("The lines of this pay app, added up.")],
    sov_overbilling: [record(`The schedule of values in the subcontract (${prior} line${prior === 1 ? "" : "s"}), including approved change orders.`)],
    previously_billed: [record("Earlier pay apps you approved on this subcontract.")],
    retainage_rate: retainage.length ? retainage : [record("The approved payment rules do not state a retainage rate.")],
    net_due_math: [record("This pay app's own figures: billed this period less retainage.")],
    period_sequence: [record("The number and period of the last approved pay app on this subcontract.")],
    contract_sum: [record("The subcontract sum, including approved change orders.")],
  };

  return {
    app,
    rules: active ? { version: active.version, approvedBy: await name(active.approvedBy), approvedAt: active.approvedAt } : null,
    sources,
    reviewedBy: await name(app.reviewedBy),
  };
}
