/**
 * Org-scoped reads. Every query that returns business data goes through here, so a persona can only
 * ever see rows that belong to its own organization:
 *   - a GC sees its projects and the contracts it holds,
 *   - a sub sees only the contracts where it is the subcontractor,
 *   - an owner sees the projects it owns.
 * Tests in scoped.test.ts assert that cross-org reads return nothing.
 */
import { and, desc, eq, inArray, isNull, sql, type SQL } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import type { Organization, PublicUser } from "@/db/schema";
import { backchargeBalance, retentionPosition } from "@/server/actions/adjustments";
import { listLowerTier } from "@/server/actions/lower-tier";
import { effectiveValues, type StoredRules } from "@/server/rules/review";
import { invitationPath, invitationStatus, type InvitationStatus } from "@/server/actions/invitations";

const { contracts, projects, documents, lienWaivers, ruleSets, sovLines, payApplications, releases } = schema;

const NO_ROWS = eq(contracts.id, "00000000-0000-0000-0000-000000000000");

async function listProjectIds(org: Organization): Promise<string[]> {
  const db = await getDb();
  if (org.kind === "gc") {
    return (await db.select({ id: projects.id }).from(projects).where(eq(projects.gcOrgId, org.id))).map((r) => r.id);
  }
  if (org.kind === "owner") {
    return (await db.select({ id: projects.id }).from(projects).where(eq(projects.ownerOrgId, org.id))).map((r) => r.id);
  }
  // sub: projects where it holds at least one contract
  const rows = await db
    .selectDistinct({ id: contracts.projectId })
    .from(contracts)
    .where(eq(contracts.subOrgId, org.id));
  return rows.map((r) => r.id);
}

/** SQL predicate selecting the contracts visible to this org. */
export async function scopePredicate(org: Organization): Promise<SQL> {
  switch (org.kind) {
    case "gc":
      return eq(contracts.gcOrgId, org.id);
    case "sub":
      return eq(contracts.subOrgId, org.id);
    case "owner": {
      const ids = await listProjectIds(org);
      return ids.length ? inArray(contracts.projectId, ids) : NO_ROWS;
    }
  }
}

export async function listProjects(org: Organization) {
  const db = await getDb();
  const ids = await listProjectIds(org);
  if (!ids.length) return [];
  return db.query.projects.findMany({
    where: inArray(projects.id, ids),
    with: { gc: true, owner: true },
    orderBy: [desc(projects.createdAt)],
  });
}

export async function getProject(org: Organization, projectId: string) {
  const ids = await listProjectIds(org);
  if (!ids.includes(projectId)) return null;
  const db = await getDb();
  return (
    (await db.query.projects.findFirst({
      where: eq(projects.id, projectId),
      with: { gc: true, owner: true },
    })) ?? null
  );
}

export async function listContracts(org: Organization, projectId?: string) {
  const db = await getDb();
  const scope = await scopePredicate(org);
  return db.query.contracts.findMany({
    where: projectId ? and(scope, eq(contracts.projectId, projectId)) : scope,
    with: { sub: true, payer: true, project: true },
    orderBy: [desc(contracts.contractSumCents)],
  });
}

export async function getContract(org: Organization, contractId: string) {
  const db = await getDb();
  const scope = await scopePredicate(org);
  return (
    (await db.query.contracts.findFirst({
      where: and(scope, eq(contracts.id, contractId)),
      with: {
        sub: true,
        project: { with: { gc: true, owner: true } },
        sovLines: { orderBy: [sovLines.lineNo] },
        ruleSets: { orderBy: [desc(ruleSets.version)] },
        payApplications: { orderBy: [desc(payApplications.number)] },
      },
    })) ?? null
  );
}

/** A document is readable when the org uploaded it or it is attached to a contract/waiver in scope. */
export async function getDocument(org: Organization, documentId: string) {
  const db = await getDb();
  const doc = await db.query.documents.findFirst({ where: eq(documents.id, documentId) });
  if (!doc) return null;
  if (doc.orgId === org.id) return doc;
  const scope = await scopePredicate(org);
  const viaContract = await db
    .select({ id: contracts.id })
    .from(contracts)
    .where(and(scope, eq(contracts.documentId, documentId)))
    .limit(1);
  if (viaContract.length) return doc;
  const viaWaiver = await db
    .select({ id: lienWaivers.id })
    .from(lienWaivers)
    .innerJoin(contracts, eq(lienWaivers.contractId, contracts.id))
    .where(and(scope, eq(lienWaivers.documentId, documentId)))
    .limit(1);
  return viaWaiver.length ? doc : null;
}

export async function listReleasesForContract(org: Organization, contractId: string) {
  const contract = await getContract(org, contractId);
  if (!contract) return [];
  const db = await getDb();
  return db.query.releases.findMany({
    where: eq(releases.contractId, contractId),
    with: { event: true, waivers: true, payment: true, payApplication: true },
    orderBy: [desc(releases.createdAt)],
  });
}


/** Everything the waterfall board shows: owner payments with their releases, waivers and payments. */
export async function getProjectBoard(org: Organization, projectId: string) {
  const project = await getProject(org, projectId);
  if (!project) return null;
  const db = await getDb();
  const scope = await scopePredicate(org);
  const contractRows = await db.query.contracts.findMany({
    where: and(scope, eq(contracts.projectId, projectId)),
    with: { sub: true, payApplications: { orderBy: [desc(payApplications.number)] } },
    orderBy: [desc(contracts.contractSumCents)],
  });
  const contractIds = contractRows.map((c) => c.id);
  const events = await db.query.ownerPaymentEvents.findMany({
    // The board shows the owner's payments; lower-tier funding events hang off their upstream release.
    where: and(eq(schema.ownerPaymentEvents.projectId, projectId), isNull(schema.ownerPaymentEvents.payerContractId)),
    with: {
      releases: {
        with: { waivers: { orderBy: [desc(lienWaivers.createdAt)] }, payment: true, payApplication: true },
      },
    },
    orderBy: [desc(schema.ownerPaymentEvents.receivedAt)],
  });
  // A sub only sees its own releases; the GC and owner see all.
  const visible = events.map((e) => ({ ...e, releases: e.releases.filter((r) => contractIds.includes(r.contractId)) }));
  const ledger = await db
    .select({ account: schema.ledgerEntries.account, total: sql<string>`coalesce(sum(${schema.ledgerEntries.deltaCents}), 0)` })
    .from(schema.ledgerEntries)
    .where(eq(schema.ledgerEntries.projectId, projectId))
    .groupBy(schema.ledgerEntries.account);
  const balances = Object.fromEntries(ledger.map((l) => [l.account, Number(l.total)])) as Partial<Record<(typeof ledger)[number]["account"], number>>;
  return { project, contracts: contractRows, events: visible, balances };
}

export async function getRelease(org: Organization, releaseId: string) {
  const db = await getDb();
  const scope = await scopePredicate(org);
  const rows = await db
    .select({ id: releases.id })
    .from(releases)
    .innerJoin(contracts, eq(releases.contractId, contracts.id))
    .where(and(scope, eq(releases.id, releaseId)))
    .limit(1);
  if (!rows.length) return null;
  return (
    (await db.query.releases.findFirst({
      where: eq(releases.id, releaseId),
      with: {
        event: true,
        payment: true,
        payApplication: true,
        waivers: { orderBy: [desc(lienWaivers.createdAt)] },
        contract: { with: { sub: true, project: { with: { gc: true, owner: true } } } },
      },
    })) ?? null
  );
}

export async function getWaiver(org: Organization, waiverId: string) {
  const db = await getDb();
  const scope = await scopePredicate(org);
  const rows = await db
    .select({ id: lienWaivers.id })
    .from(lienWaivers)
    .innerJoin(contracts, eq(lienWaivers.contractId, contracts.id))
    .where(and(scope, eq(lienWaivers.id, waiverId)))
    .limit(1);
  if (!rows.length) return null;
  return (
    (await db.query.lienWaivers.findFirst({
      where: eq(lienWaivers.id, waiverId),
      with: { release: { with: { event: true, payApplication: true, contract: { with: { sub: true, project: { with: { gc: true, owner: true } } } } } } },
    })) ?? null
  );
}

/** Sub portal: every release across the org's contracts, newest owner payment first. */
export async function listReleasesForOrg(org: Organization) {
  const db = await getDb();
  const scope = await scopePredicate(org);
  const ids = (await db.select({ id: contracts.id }).from(contracts).where(scope)).map((r) => r.id);
  if (!ids.length) return [];
  return db.query.releases.findMany({
    where: inArray(releases.contractId, ids),
    with: { event: true, waivers: { orderBy: [desc(lienWaivers.createdAt)] }, payment: true, payApplication: true, contract: { with: { sub: true, project: true } } },
    orderBy: [desc(releases.createdAt)],
  });
}

export async function getPayApp(org: Organization, payAppId: string) {
  const db = await getDb();
  const scope = await scopePredicate(org);
  const rows = await db
    .select({ id: payApplications.id })
    .from(payApplications)
    .innerJoin(contracts, eq(payApplications.contractId, contracts.id))
    .where(and(scope, eq(payApplications.id, payAppId)))
    .limit(1);
  if (!rows.length) return null;
  return (
    (await db.query.payApplications.findFirst({
      where: eq(payApplications.id, payAppId),
      with: {
        lines: { with: { sovLine: true } },
        contract: { with: { sub: true, sovLines: { orderBy: [sovLines.lineNo] }, project: { with: { gc: true, owner: true } } } },
        releases: { with: { event: true } },
      },
    })) ?? null
  );
}

/** Ledger entries across the org's projects, newest first, with per-account balances. */
export async function getLedger(org: Organization, limit = 200) {
  const db = await getDb();
  const ids = await listProjectIds(org);
  if (!ids.length) return { entries: [], balances: {} as Record<string, number>, projects: [] as { id: string; name: string }[] };
  const entries = await db.query.ledgerEntries.findMany({
    where: inArray(schema.ledgerEntries.projectId, ids),
    orderBy: [desc(schema.ledgerEntries.createdAt)],
    limit,
  });
  const totals = await db
    .select({ account: schema.ledgerEntries.account, total: sql<string>`coalesce(sum(${schema.ledgerEntries.deltaCents}), 0)` })
    .from(schema.ledgerEntries)
    .where(inArray(schema.ledgerEntries.projectId, ids))
    .groupBy(schema.ledgerEntries.account);
  const projectRows = await db.select({ id: projects.id, name: projects.name }).from(projects).where(inArray(projects.id, ids));
  const contractRows = await db.query.contracts.findMany({ where: inArray(contracts.projectId, ids), with: { sub: true } });
  return {
    entries: entries.map((e) => ({ ...e, subName: contractRows.find((c) => c.id === e.contractId)?.sub.name ?? null })),
    balances: Object.fromEntries(totals.map((t) => [t.account, Number(t.total)])) as Record<string, number>,
    projects: projectRows,
  };
}

/** Change orders, backcharges, retention position and the lower tier for a contract in scope. */
export async function getContractAdjustments(org: Organization, contractId: string) {
  const contract = await getContract(org, contractId);
  if (!contract) return null;
  const db = await getDb();
  const [changeOrders, backcharge, retention, lowerTier] = await Promise.all([
    db.query.changeOrders.findMany({ where: eq(schema.changeOrders.contractId, contractId), orderBy: [desc(schema.changeOrders.number)] }),
    backchargeBalance(db, contractId),
    retentionPosition(db, contractId),
    listLowerTier(db, contractId),
  ]);
  const active = contract.ruleSets.find((r) => r.id === contract.activeRuleSetId);
  const rules = active ? effectiveValues(active.rules as StoredRules) : null;
  return { contract, changeOrders, backcharge, retention, lowerTier, rules };
}

/** Lower-tier funding events carried by a release, for the release page. */
export async function getDownstream(org: Organization, releaseId: string) {
  const release = await getRelease(org, releaseId);
  if (!release) return [];
  const db = await getDb();
  return db.query.ownerPaymentEvents.findMany({
    where: eq(schema.ownerPaymentEvents.parentReleaseId, releaseId),
    with: { releases: { with: { contract: { with: { sub: true } }, waivers: { orderBy: [desc(lienWaivers.createdAt)] }, payment: true } } },
  });
}

/**
 * Stand-in for email in the demo: the messages Groundwork would send to lower-tier claimants, each
 * with its signing link. No page reads this at present (the demo panel that did was removed); it is
 * kept, and covered by a test, as the one place a lower-tier signing link can be listed.
 */
export async function demoOutbox() {
  const db = await getDb();
  // Sample workspace only: a real claimant's signing link is theirs alone.
  const sample = db
    .select({ id: contracts.id })
    .from(contracts)
    .innerJoin(schema.organizations, eq(contracts.gcOrgId, schema.organizations.id))
    .where(eq(schema.organizations.isDemo, true));
  const rows = await db.query.lienWaivers.findMany({
    where: and(eq(lienWaivers.status, "sent"), sql`${lienWaivers.signToken} is not null`, inArray(lienWaivers.contractId, sample)),
    with: { release: { with: { contract: { with: { sub: true, payer: true } } } } },
    orderBy: [desc(lienWaivers.createdAt)],
  });
  return rows.map((w) => ({ id: w.id, to: w.release.contract.sub.name, from: w.release.contract.payer.name, cents: w.release.releaseCents, form: w.form, href: `/w/${w.signToken}` }));
}

// ─── People and invitations ─────────────────────────────────────────────────

/** The people in the caller's own company, oldest first. `hasPassword` is false for a placeholder who has not accepted an invitation. */
export async function listMembers(org: Organization): Promise<(PublicUser & { hasPassword: boolean })[]> {
  const db = await getDb();
  const rows = await db.query.users.findMany({ where: eq(schema.users.orgId, org.id), orderBy: [schema.users.createdAt, schema.users.name] });
  return rows.map(({ passwordHash, ...u }) => ({ ...u, hasPassword: passwordHash !== null }));
}

export type InvitationRow = {
  id: string;
  email: string;
  name: string | null;
  role: PublicUser["role"];
  status: InvitationStatus;
  /** The company the invitee joins: the caller's own, one of its subcontractors, or one of its owners. */
  org: { id: string; name: string; kind: Organization["kind"] };
  invitedBy: { id: string; name: string };
  createdAt: Date;
  expiresAt: Date;
  acceptedAt: Date | null;
  /** Path of the accept page, to turn into a link and copy. Null once the invitation is used or expired. */
  path: string | null;
};

/**
 * Invitations sent by people in the caller's company, newest first, with the link for each one that
 * is still open. There is no email service, so this list is how an invitation is delivered: the
 * inviter copies the link. Invitations another company sent are not listed, even into this company.
 */
export async function listInvitations(org: Organization): Promise<InvitationRow[]> {
  const db = await getDb();
  const senders = db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.orgId, org.id));
  const rows = await db.query.invitations.findMany({
    where: inArray(schema.invitations.invitedByUserId, senders),
    with: { org: true, invitedBy: { columns: { id: true, name: true } } },
    orderBy: [desc(schema.invitations.createdAt)],
  });
  return rows.map((i) => {
    const status = invitationStatus(i);
    return {
      id: i.id,
      email: i.email,
      name: i.name,
      role: i.role,
      status,
      org: { id: i.org.id, name: i.org.name, kind: i.org.kind },
      invitedBy: i.invitedBy,
      createdAt: i.createdAt,
      expiresAt: i.expiresAt,
      acceptedAt: i.acceptedAt,
      path: status === "pending" ? invitationPath(i.token) : null,
    };
  });
}

/** Account-less access: a waiver by its signing token, with what a claimant needs to see. */
export async function getWaiverByToken(token: string) {
  if (!/^[\w-]{20,}$/.test(token)) return null;
  const db = await getDb();
  return (
    (await db.query.lienWaivers.findFirst({
      where: eq(lienWaivers.signToken, token),
      with: { release: { with: { event: { with: { parentRelease: true } }, payment: true, payApplication: true, waivers: { orderBy: [desc(lienWaivers.createdAt)] }, contract: { with: { sub: true, payer: true, project: { with: { gc: true, owner: true } } } } } } },
    })) ?? null
  );
}
