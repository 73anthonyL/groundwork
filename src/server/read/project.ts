/**
 * Read model for one project: plain, serializable views built for display.
 *
 * Pages and the JSON API (/api/v1/projects/:id/...) call the same functions, so anything a chart or
 * animation shows can also be fetched. Every view is scoped to what the caller's organization may
 * see: a general contractor or owner sees the whole project, a subcontractor sees its own contracts
 * and the lower tier beneath them.
 */
import { and, asc, eq, inArray, or } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import type { Organization } from "@/db/schema";
import { getProject, scopePredicate } from "@/server/scoped";
import { now } from "@/server/clock";
import { statute } from "@/domain/statutes";
import { releaseLabel } from "@/lib/release-label";

const { contracts, releases, ownerPaymentEvents, payApplications, ledgerEntries, events } = schema;

export type Party = { id: string; name: string; role: "owner" | "gc" | "sub" | "lower" };

async function scope(org: Organization, projectId: string) {
  const project = await getProject(org, projectId);
  if (!project) return null;
  const db = await getDb();
  const pred = await scopePredicate(org);
  const top = await db.query.contracts.findMany({ where: and(pred, eq(contracts.projectId, projectId)), with: { sub: true, payer: true } });
  const topIds = top.map((c) => c.id);
  // A subcontractor's own lower tier is in scope: contracts whose parent it holds.
  const lower = topIds.length ? await db.query.contracts.findMany({ where: inArray(contracts.parentContractId, topIds), with: { sub: true, payer: true } }) : [];
  const all = [...top.filter((c) => !lower.some((l) => l.id === c.id)), ...lower];
  return { db, project, contracts: all, ids: all.map((c) => c.id), whole: org.kind !== "sub" };
}

// ─── Summary ────────────────────────────────────────────────────────────────

export type ContractSummary = {
  id: string;
  parentContractId: string | null;
  tier: 1 | 2;
  payee: string;
  payer: string;
  trade: string;
  status: string;
  contractSumCents: number;
  billedCents: number;
  fundedCents: number;
  paidCents: number;
  inMotionCents: number;
  retainageHeldCents: number;
  backchargedCents: number;
  awaitingOwnerCents: number;
  percentBilled: number;
};

export type ProjectSummary = {
  project: { id: string; name: string; address: string | null; state: string; owner: string; gc: string; primeContractSumCents: number };
  balances: Record<string, number>;
  totals: { committedCents: number; billedCents: number; paidCents: number; inMotionCents: number; retainageHeldCents: number; awaitingOwnerCents: number; openReleases: number; overdueReleases: number };
  contracts: ContractSummary[];
  asOf: string;
};

export async function projectSummary(org: Organization, projectId: string): Promise<ProjectSummary | null> {
  const s = await scope(org, projectId);
  if (!s) return null;
  const { db, project } = s;
  const rels = s.ids.length ? await db.query.releases.findMany({ where: inArray(releases.contractId, s.ids) }) : [];
  const apps = s.ids.length ? await db.query.payApplications.findMany({ where: and(inArray(payApplications.contractId, s.ids), inArray(payApplications.status, ["submitted", "approved", "funded", "closed"])) }) : [];
  const ledger = await db.query.ledgerEntries.findMany({ where: eq(ledgerEntries.projectId, projectId) });
  const balances: Record<string, number> = {};
  for (const l of ledger) if (s.whole || (l.contractId && s.ids.includes(l.contractId))) balances[l.account] = (balances[l.account] ?? 0) + l.deltaCents;
  const at = now();
  const paid = (st: string) => st === "paid" || st === "settled";
  const list: ContractSummary[] = s.contracts.map((c) => {
    const mine = rels.filter((r) => r.contractId === c.id);
    const billed = apps.filter((a) => a.contractId === c.id).reduce((x, a) => x + a.workThisPeriodCents + a.storedMaterialsCents, 0);
    const funded = mine.reduce((x, r) => x + r.grossCents, 0);
    return {
      id: c.id,
      parentContractId: c.parentContractId,
      tier: c.parentContractId ? 2 : 1,
      payee: c.sub.name,
      payer: c.payer.name,
      trade: c.trade,
      status: c.status,
      contractSumCents: c.contractSumCents,
      billedCents: billed,
      fundedCents: funded,
      paidCents: mine.filter((r) => paid(r.status)).reduce((x, r) => x + r.releaseCents, 0),
      inMotionCents: mine.filter((r) => !paid(r.status) && r.status !== "blocked").reduce((x, r) => x + r.releaseCents, 0),
      retainageHeldCents: mine.reduce((x, r) => x + r.retainageWithheldCents - ((r.basis as { retentionReleasedCents?: number }).retentionReleasedCents ?? 0), 0),
      backchargedCents: mine.reduce((x, r) => x + r.offsetCents, 0),
      awaitingOwnerCents: Math.max(0, billed - funded),
      percentBilled: c.contractSumCents ? Math.round((billed / c.contractSumCents) * 1000) / 10 : 0,
    };
  });
  const t1 = list.filter((c) => c.tier === 1);
  const open = rels.filter((r) => !paid(r.status) && r.status !== "blocked");
  return {
    project: { id: project.id, name: project.name, address: project.address, state: project.state, owner: project.owner.name, gc: project.gc.name, primeContractSumCents: project.primeContractSumCents },
    balances,
    totals: {
      committedCents: t1.reduce((x, c) => x + c.contractSumCents, 0),
      billedCents: t1.reduce((x, c) => x + c.billedCents, 0),
      paidCents: t1.reduce((x, c) => x + c.paidCents, 0),
      inMotionCents: t1.reduce((x, c) => x + c.inMotionCents, 0),
      retainageHeldCents: t1.reduce((x, c) => x + c.retainageHeldCents, 0),
      awaitingOwnerCents: t1.reduce((x, c) => x + c.awaitingOwnerCents, 0),
      openReleases: open.length,
      overdueReleases: open.filter((r) => r.payByAt && r.payByAt < at).length,
    },
    contracts: list,
    asOf: at.toISOString(),
  };
}

// ─── Money flow ─────────────────────────────────────────────────────────────

export type FlowNode = { id: string; kind: "owner" | "gc" | "sub" | "lower" | "retainage" | "backcharge" | "unallocated"; label: string; depth: number; contractId?: string };
export type FlowLink = {
  source: string;
  target: string;
  cents: number;
  /** paid: landed. moving: planned and on its way. held: retainage. setoff: backcharge kept. idle: owner money not matched to a sub. */
  kind: "paid" | "moving" | "held" | "setoff" | "idle";
  eventId: string;
  releaseId?: string;
  status?: string;
  label?: string;
  payByAt?: string | null;
};
export type FlowEvent = { id: string; reference: string; receivedAt: string; amountCents: number; retentionCents: number; periodThrough: string; tier: 1 | 2; parentReleaseId: string | null; links: FlowLink[] };
export type ProjectFlow = { nodes: FlowNode[]; links: FlowLink[]; events: FlowEvent[]; totalInCents: number };

/**
 * The project as a graph of money: owner → general contractor → subcontractors → their lower tier,
 * with retainage and backcharges as sinks. `links` is every edge; `events` groups them per funding
 * event in the order the money arrived, which is what an animation plays back.
 */
export async function projectFlow(org: Organization, projectId: string): Promise<ProjectFlow | null> {
  const s = await scope(org, projectId);
  if (!s) return null;
  const { db, project } = s;
  const evs = await db.query.ownerPaymentEvents.findMany({
    where: eq(ownerPaymentEvents.projectId, projectId),
    with: { releases: { with: { payApplication: true } } },
    orderBy: [asc(ownerPaymentEvents.receivedAt), asc(ownerPaymentEvents.createdAt)],
  });
  const byId = new Map(s.contracts.map((c) => [c.id, c]));
  const nodes = new Map<string, FlowNode>();
  const add = (n: FlowNode) => {
    if (!nodes.has(n.id)) nodes.set(n.id, n);
    return n.id;
  };
  const OWNER = add({ id: "owner", kind: "owner", label: project.owner.name, depth: 0 });
  const GC = add({ id: "gc", kind: "gc", label: project.gc.name, depth: 1 });
  const out: FlowEvent[] = [];
  const paid = (st: string) => st === "paid" || st === "settled";

  for (const e of evs) {
    const visible = e.releases.filter((r) => byId.has(r.contractId));
    if (!s.whole && !visible.length) continue;
    const links: FlowLink[] = [];
    const top = e.payerContractId === null;
    const payerNode = top ? GC : `c:${e.payerContractId}`;
    if (top && s.whole) links.push({ source: OWNER, target: GC, cents: e.amountCents, kind: "paid", eventId: e.id, label: e.reference });
    let fundedGross = 0;
    for (const r of visible) {
      const c = byId.get(r.contractId)!;
      const node = add({ id: `c:${c.id}`, kind: c.parentContractId ? "lower" : "sub", label: c.sub.name, depth: c.parentContractId ? 3 : 2, contractId: c.id });
      fundedGross += r.grossCents;
      if (r.releaseCents > 0) {
        links.push({ source: payerNode, target: node, cents: r.releaseCents, kind: paid(r.status) ? "paid" : "moving", eventId: e.id, releaseId: r.id, status: r.status, label: releaseLabel(r), payByAt: r.payByAt?.toISOString() ?? null });
      }
      if (r.retainageWithheldCents > 0) links.push({ source: payerNode, target: add({ id: "retainage", kind: "retainage", label: "Retainage held", depth: 2 }), cents: r.retainageWithheldCents, kind: "held", eventId: e.id, releaseId: r.id, label: c.sub.name });
      if (r.offsetCents > 0) links.push({ source: payerNode, target: add({ id: "backcharge", kind: "backcharge", label: "Backcharges", depth: 2 }), cents: r.offsetCents, kind: "setoff", eventId: e.id, releaseId: r.id, label: c.sub.name });
    }
    if (top && s.whole) {
      const idle = e.amountCents - e.retentionCents - fundedGross;
      if (idle > 0) links.push({ source: GC, target: add({ id: "unallocated", kind: "unallocated", label: "Not yet allocated", depth: 2 }), cents: idle, kind: "idle", eventId: e.id });
    }
    out.push({ id: e.id, reference: e.reference, receivedAt: e.receivedAt.toISOString(), amountCents: e.amountCents, retentionCents: e.retentionCents, periodThrough: e.periodThrough, tier: top ? 1 : 2, parentReleaseId: e.parentReleaseId, links });
  }
  return { nodes: [...nodes.values()], links: out.flatMap((e) => e.links), events: out, totalInCents: out.filter((e) => e.tier === 1).reduce((x, e) => x + e.amountCents, 0) };
}

// ─── Timeline ───────────────────────────────────────────────────────────────

export type TimelineEntry = {
  id: string;
  at: string;
  type: string;
  /** Which lane an entry belongs to when drawn. */
  lane: "contract" | "billing" | "money" | "waiver" | "adjustment";
  title: string;
  detail: string | null;
  actor: string;
  amountCents: number | null;
  contractId: string | null;
  party: string | null;
  correlationId: string;
};

const TITLES: Record<string, { lane: TimelineEntry["lane"]; title: string }> = {
  "rules.extracted": { lane: "contract", title: "Subcontract compiled" },
  "rules.field_accepted": { lane: "contract", title: "Flagged field accepted" },
  "rules.field_overridden": { lane: "contract", title: "Field overridden" },
  "rules.anomaly_acknowledged": { lane: "contract", title: "Anomaly acknowledged" },
  "rules.approved": { lane: "contract", title: "Payment rules approved and frozen" },
  "pay_app.submitted": { lane: "billing", title: "Pay application submitted" },
  "pay_app.approved": { lane: "billing", title: "Pay application approved" },
  "pay_app.changes_requested": { lane: "billing", title: "Changes requested" },
  "owner_payment.recorded": { lane: "money", title: "Owner payment received" },
  "lower_tier.funded": { lane: "money", title: "Lower-tier share planned" },
  "release.planned": { lane: "money", title: "Release planned" },
  "payment.initiated": { lane: "money", title: "Payment sent" },
  "payment.paid": { lane: "money", title: "Paid" },
  "payment.failed": { lane: "money", title: "Payment failed" },
  "release.settled": { lane: "waiver", title: "Closed out" },
  "waiver.signed": { lane: "waiver", title: "Waiver signed" },
  "change_order.proposed": { lane: "adjustment", title: "Change order requested" },
  "change_order.approved": { lane: "adjustment", title: "Change order approved" },
  "change_order.rejected": { lane: "adjustment", title: "Change order rejected" },
  "backcharge.recorded": { lane: "adjustment", title: "Backcharge recorded" },
  "backcharge.voided": { lane: "adjustment", title: "Backcharge withdrawn" },
  "retention.certified": { lane: "adjustment", title: "Retention release certified" },
  "lower_tier.added": { lane: "adjustment", title: "Lower-tier party added" },
};

/** Everything that happened on the project, oldest first, from the append-only event log. */
export async function projectTimeline(org: Organization, projectId: string, limit = 500): Promise<TimelineEntry[] | null> {
  const s = await scope(org, projectId);
  if (!s) return null;
  const { db } = s;
  const apps = s.ids.length ? await db.select({ id: payApplications.id, contractId: payApplications.contractId, number: payApplications.number }).from(payApplications).where(inArray(payApplications.contractId, s.ids)) : [];
  const rels = s.ids.length ? await db.select({ id: releases.id, contractId: releases.contractId }).from(releases).where(inArray(releases.contractId, s.ids)) : [];
  const contractOf = new Map<string, string>([...s.ids.map((id) => [id, id] as const), ...apps.map((a) => [a.id, a.contractId] as const), ...rels.map((r) => [r.id, r.contractId] as const)]);
  const aggregateIds = [...contractOf.keys(), ...(s.whole ? [projectId] : [])];
  if (!aggregateIds.length) return [];
  const rows = await db.query.events.findMany({ where: or(inArray(events.aggregateId, aggregateIds)), orderBy: [asc(events.createdAt)], limit });
  const name = (contractId: string | null) => (contractId ? (s.contracts.find((c) => c.id === contractId)?.sub.name ?? null) : null);
  return rows
    .filter((e) => e.type !== "release.explained")
    .map((e) => {
      const p = e.payload as Record<string, unknown>;
      const contractId = contractOf.get(e.aggregateId) ?? (typeof p.contractId === "string" ? p.contractId : null);
      const meta = TITLES[e.type] ?? { lane: "contract" as const, title: e.type };
      const cents = ["amountCents", "releaseCents", "grossCents", "sumCents"].map((k) => p[k]).find((v): v is number => typeof v === "number") ?? null;
      const detail =
        typeof p.reference === "string" ? p.reference : typeof p.title === "string" ? p.title : typeof p.reason === "string" ? p.reason : typeof p.note === "string" ? p.note : typeof p.name === "string" ? p.name : typeof p.form === "string" ? (p.form.startsWith("c") ? "Conditional" : "Unconditional") : null;
      return { id: e.id, at: e.createdAt.toISOString(), type: e.type, lane: meta.lane, title: meta.title, detail, actor: e.actorLabel, amountCents: cents, contractId, party: name(contractId), correlationId: e.correlationId };
    });
}

// ─── Balances over time ─────────────────────────────────────────────────────

export type SeriesPoint = { at: string; memo: string; balances: Record<string, number> };

/** Running ledger balances after every posting, oldest first. One point per group of postings. */
export async function projectSeries(org: Organization, projectId: string): Promise<SeriesPoint[] | null> {
  const s = await scope(org, projectId);
  if (!s) return null;
  const rows = await s.db.query.ledgerEntries.findMany({ where: eq(ledgerEntries.projectId, projectId), orderBy: [asc(ledgerEntries.createdAt)] });
  const running: Record<string, number> = {};
  const points: SeriesPoint[] = [];
  for (const l of rows) {
    if (!s.whole && !(l.contractId && s.ids.includes(l.contractId))) continue;
    running[l.account] = (running[l.account] ?? 0) + l.deltaCents;
    const at = l.createdAt.toISOString();
    const last = points[points.length - 1];
    if (last && last.at === at) last.balances = { ...running };
    else points.push({ at, memo: l.memo, balances: { ...running } });
  }
  return points;
}

// ─── Clocks ─────────────────────────────────────────────────────────────────

export type Clock = {
  releaseId: string;
  contractId: string;
  party: string;
  payer: string;
  tier: 1 | 2;
  label: string;
  cents: number;
  status: string;
  startedAt: string;
  payByAt: string | null;
  msLeft: number | null;
  /** 0 at the start of the statutory or contract period, 1 at the deadline, above 1 when late. */
  elapsed: number | null;
  citations: { id: string; cite: string; title: string }[];
};

/** Every release still in motion with its deadline and the law behind it, most urgent first. */
export async function projectClocks(org: Organization, projectId: string): Promise<Clock[] | null> {
  const s = await scope(org, projectId);
  if (!s) return null;
  if (!s.ids.length) return [];
  const rows = await s.db.query.releases.findMany({ where: inArray(releases.contractId, s.ids), with: { event: true, payApplication: true } });
  const at = now().getTime();
  return rows
    .filter((r) => !["paid", "settled", "blocked"].includes(r.status))
    .map((r) => {
      const c = s.contracts.find((x) => x.id === r.contractId)!;
      const start = r.event.receivedAt.getTime();
      const due = r.payByAt?.getTime() ?? null;
      return {
        releaseId: r.id,
        contractId: r.contractId,
        party: c.sub.name,
        payer: c.payer.name,
        tier: (c.parentContractId ? 2 : 1) as 1 | 2,
        label: releaseLabel(r),
        cents: r.releaseCents,
        status: r.status,
        startedAt: r.event.receivedAt.toISOString(),
        payByAt: r.payByAt?.toISOString() ?? null,
        msLeft: due === null ? null : due - at,
        elapsed: due === null || due === start ? null : Math.max(0, (at - start) / (due - start)),
        citations: [...new Set((r.basis as { statutes?: string[] }).statutes ?? [])].map((id) => ({ id, cite: statute(id).cite, title: statute(id).title })),
      };
    })
    .sort((a, b) => (a.msLeft ?? Infinity) - (b.msLeft ?? Infinity));
}

export type ProjectOverview = { summary: ProjectSummary; flow: ProjectFlow; timeline: TimelineEntry[]; series: SeriesPoint[]; clocks: Clock[] };

export async function projectOverview(org: Organization, projectId: string): Promise<ProjectOverview | null> {
  const summary = await projectSummary(org, projectId);
  if (!summary) return null;
  const [flow, timeline, series, clocks] = await Promise.all([projectFlow(org, projectId), projectTimeline(org, projectId), projectSeries(org, projectId), projectClocks(org, projectId)]);
  return { summary, flow: flow!, timeline: timeline!, series: series!, clocks: clocks! };
}
