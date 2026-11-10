/**
 * Reads for the general contractor's own pages: what is waiting on the contractor, how far a new
 * company is through setting up, and whether each subcontractor has been invited.
 *
 * Every function takes the caller's organization and returns only rows that organization holds
 * (contracts where it is the general contractor). Anyone who is not a general contractor gets nothing.
 */
import { and, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import type { Organization } from "@/db/schema";
import { listInvitations, listProjects } from "@/server/scoped";
import { now } from "@/server/clock";
import { releaseLabel } from "@/lib/release-label";

const { contracts, releases, users, ownerPaymentEvents } = schema;

/** A payment shows up as needing attention this long before its deadline. */
export const DEADLINE_NEAR_DAYS = 3;
const DAY_MS = 86_400_000;

export type AttentionItem = {
  id: string;
  kind: "pay_app" | "rules" | "payment";
  projectId: string;
  projectName: string;
  subName: string;
  /** What is waiting, in words: "Pay app #2", "Payment rules", "Pay app #1 payment". */
  what: string;
  amountCents: number | null;
  /** A status key for StatusPill, with `kind` saying which map it belongs to. */
  status: string;
  /** Payments only: the pay-by deadline. */
  deadline: string | null;
  href: string;
  action: string;
};

async function gcContracts(org: Organization, projectId?: string) {
  if (org.kind !== "gc") return [];
  const db = await getDb();
  const rows = await db.query.contracts.findMany({
    where: projectId ? and(eq(contracts.gcOrgId, org.id), eq(contracts.projectId, projectId)) : eq(contracts.gcOrgId, org.id),
    with: { sub: true, project: true, payApplications: true },
  });
  // The contractor's own subcontracts: a subcontractor's lower tier is that subcontractor's to manage.
  return rows.filter((c) => c.parentContractId === null && c.project.gcOrgId === org.id);
}

/**
 * Everything waiting on the contractor, most urgent first: pay apps to review, subcontracts whose
 * payment rules have not been read or approved, and payments that failed or are past or within
 * DEADLINE_NEAR_DAYS of their deadline. Pass `projectId` for one project.
 */
export async function gcAttention(org: Organization, projectId?: string): Promise<AttentionItem[]> {
  const mine = await gcContracts(org, projectId);
  if (!mine.length) return [];
  const db = await getDb();
  const at = now().getTime();
  const items: (AttentionItem & { rank: number })[] = [];

  for (const c of mine) {
    const base = { projectId: c.projectId, projectName: c.project.name, subName: c.sub.name };
    for (const a of c.payApplications) {
      if (a.status !== "submitted") continue;
      items.push({ ...base, id: `a:${a.id}`, kind: "pay_app", what: `Pay app #${a.number}`, amountCents: a.workThisPeriodCents + a.storedMaterialsCents, status: a.status, deadline: null, href: `/gc/pay-apps/${a.id}`, action: "Review", rank: 2 });
    }
    if (c.status !== "active") {
      const unread = c.status === "draft";
      items.push({ ...base, id: `c:${c.id}`, kind: "rules", what: "Payment rules", amountCents: c.contractSumCents, status: c.status, deadline: null, href: unread ? `/gc/contracts/${c.id}?read=1` : `/gc/contracts/${c.id}`, action: unread ? "Read contract" : c.status === "compiling" ? "Open" : "Review rules", rank: 3 });
    }
  }

  const rels = await db.query.releases.findMany({ where: inArray(releases.contractId, mine.map((c) => c.id)), with: { payApplication: true } });
  for (const r of rels) {
    if (r.status === "paid" || r.status === "settled" || r.releaseCents <= 0) continue;
    const due = r.payByAt?.getTime() ?? null;
    const failed = r.status === "blocked";
    const near = due !== null && due - at <= DEADLINE_NEAR_DAYS * DAY_MS;
    if (!failed && !near) continue;
    const c = mine.find((x) => x.id === r.contractId)!;
    const late = due !== null && due < at;
    items.push({
      id: `r:${r.id}`,
      kind: "payment",
      projectId: c.projectId,
      projectName: c.project.name,
      subName: c.sub.name,
      what: `${releaseLabel(r)} payment`,
      amountCents: r.releaseCents,
      status: r.status,
      deadline: r.payByAt?.toISOString() ?? null,
      href: `/gc/releases/${r.id}`,
      action: failed ? "Fix payment" : "Open payment",
      rank: failed || late ? 0 : 1,
    });
  }

  return items
    .sort((a, b) => a.rank - b.rank || (a.deadline ?? "9").localeCompare(b.deadline ?? "9") || a.subName.localeCompare(b.subName))
    .map((item) => {
      const { rank, ...rest } = item;
      void rank;
      return rest;
    });
}

export type GcOnboarding = {
  /** The newest project, where the next step happens. */
  projectId: string | null;
  hasProject: boolean;
  hasSubcontract: boolean;
  rulesApproved: boolean;
  /** A subcontract whose rules still need reading or approving. */
  contractToApprove: string | null;
  invited: boolean;
  /** A subcontractor nobody has been invited into yet. */
  subToInvite: string | null;
  ownerPaymentRecorded: boolean;
  /** A project with approved rules, where the first owner payment can be recorded. */
  projectToFund: string | null;
  done: number;
  total: 5;
};

/** The five steps from an empty account to the first payment, for this company. */
export async function gcOnboarding(org: Organization): Promise<GcOnboarding> {
  const projects = await listProjects(org);
  const mine = await gcContracts(org);
  const db = await getDb();
  const approved = mine.filter((c) => c.status === "active");
  const subIds = [...new Set(mine.map((c) => c.subOrgId))];
  const invitations = subIds.length ? (await listInvitations(org)).filter((i) => i.org.kind === "sub") : [];
  // In the sample workspace invitations are off and every subcontractor already has its people.
  const invited = mine.length > 0 && (org.isDemo || invitations.length > 0);
  const projectIds = projects.map((p) => p.id);
  const [payment] = projectIds.length
    ? await db
        .select({ id: ownerPaymentEvents.id })
        .from(ownerPaymentEvents)
        .where(and(inArray(ownerPaymentEvents.projectId, projectIds), isNull(ownerPaymentEvents.payerContractId)))
        .limit(1)
    : [];
  const flags = [projects.length > 0, mine.length > 0, approved.length > 0, invited, !!payment];
  return {
    projectId: projects[0]?.id ?? null,
    hasProject: flags[0],
    hasSubcontract: flags[1],
    rulesApproved: flags[2],
    contractToApprove: mine.find((c) => c.status !== "active")?.id ?? null,
    invited,
    subToInvite: subIds.find((id) => !invitations.some((i) => i.org.id === id)) ?? null,
    ownerPaymentRecorded: flags[4],
    projectToFund: approved[0]?.projectId ?? projects[0]?.id ?? null,
    done: flags.filter(Boolean).length,
    total: 5,
  };
}

export type SubAccess = {
  /** joined: someone there can sign in. invited: a link is open. expired: the link ran out. none: nobody has been invited. */
  status: "joined" | "invited" | "expired" | "none";
  email: string | null;
  /** Path of the open invitation, to copy. */
  path: string | null;
};

/** For each of the contractor's subcontractors: whether anyone there can sign in yet. */
export async function gcSubAccess(org: Organization): Promise<Record<string, SubAccess>> {
  const mine = await gcContracts(org);
  const subIds = [...new Set(mine.map((c) => c.subOrgId))];
  if (!subIds.length) return {};
  const db = await getDb();
  const members = await db
    .select({ orgId: users.orgId })
    .from(users)
    .where(and(inArray(users.orgId, subIds), isNotNull(users.passwordHash)));
  const invitations = await listInvitations(org);
  return Object.fromEntries(
    subIds.map((id) => {
      const sent = invitations.filter((i) => i.org.id === id);
      const open = sent.find((i) => i.status === "pending");
      const status: SubAccess["status"] = members.some((m) => m.orgId === id) || sent.some((i) => i.status === "accepted") ? "joined" : open ? "invited" : sent.length ? "expired" : "none";
      return [id, { status, email: (open ?? sent[0])?.email ?? null, path: status === "invited" ? (open?.path ?? null) : null }];
    }),
  );
}

/** The contractor's subcontractors, by name: the companies it may invite people into. */
export async function gcSubcontractors(org: Organization): Promise<{ id: string; name: string }[]> {
  const mine = await gcContracts(org);
  const seen = new Map<string, string>();
  for (const c of mine) seen.set(c.subOrgId, c.sub.name);
  return [...seen.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
}
