/**
 * Read model for the subcontractor's pages: its pay apps across every contract, and what the billing
 * form needs. Scoped like ./project.ts and ../scoped.ts: a subcontractor only ever gets rows for
 * contracts where it is the payee, and nothing here carries the owner's payment amounts or bank
 * references, another subcontractor's figures, or a lower-tier claimant's signing token.
 */
import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import type { Organization } from "@/db/schema";
import { getContract, scopePredicate } from "@/server/scoped";
import { listLowerTier } from "@/server/actions/lower-tier";
import { effectiveValues, type StoredRules } from "@/server/rules/review";
import { now, isoDate } from "@/server/clock";

const { contracts, payApplications, payApplicationLines } = schema;

/** Statuses in which the contractor has accepted the billing. */
const ACCEPTED = ["approved", "funded", "closed"];

export type BillingState = {
  /** True when the subcontractor can start a pay app on this contract now. */
  billable: boolean;
  /** Why not, in the reader's words. Null when billable. */
  reason: string | null;
  nextNumber: number;
  /** Suggested period-through date (YYYY-MM-DD): the month after the last pay app, or this month. */
  periodThrough: string;
  /** "November": the month the suggested period ends in. */
  periodMonth: string;
  /** Gross accepted by the contractor so far. */
  billedCents: number;
  balanceCents: number;
};

type AppLike = { number: number; periodThrough: string; status: string; workThisPeriodCents: number; storedMaterialsCents: number };

/** The last day of the month after `lastThrough`, or of the current month when nothing has been billed. */
function nextPeriodThrough(lastThrough: string | null): string {
  const d = lastThrough ? new Date(`${lastThrough}T00:00:00Z`) : now();
  // Day 0 of the month after next (or of next month) is the last day of the month we want.
  const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + (lastThrough ? 2 : 1), 0));
  return isoDate(end);
}

export function monthName(isoDay: string): string {
  return new Date(`${isoDay}T00:00:00Z`).toLocaleDateString("en-US", { month: "long", timeZone: "UTC" });
}

/** Whether a contract can be billed now, and the number and period of the next pay app. Pure. */
export function billingState(contract: { status: string; contractSumCents: number }, apps: AppLike[]): BillingState {
  const nextNumber = apps.reduce((m, p) => Math.max(m, p.number), 0) + 1;
  const last = apps.reduce<AppLike | null>((m, p) => (!m || p.number > m.number ? p : m), null);
  const periodThrough = nextPeriodThrough(last?.periodThrough ?? null);
  const billedCents = apps.filter((p) => ACCEPTED.includes(p.status)).reduce((s, p) => s + p.workThisPeriodCents + p.storedMaterialsCents, 0);
  const balanceCents = contract.contractSumCents - billedCents;
  const open = apps.find((p) => p.status === "submitted" || p.status === "changes_requested");
  const reason =
    contract.status !== "active"
      ? "Waiting for the contractor to approve this contract's payment rules."
      : open
        ? open.status === "submitted"
          ? `Pay app #${open.number} is with the contractor for review.`
          : `Pay app #${open.number} was sent back for correction.`
        : balanceCents <= 0
          ? "This contract is fully billed."
          : null;
  return { billable: reason === null, reason, nextNumber, periodThrough, periodMonth: monthName(periodThrough), billedCents, balanceCents };
}

/** Every pay app this company has submitted, newest first, with its contract and project. */
export async function listPayAppsForOrg(org: Organization) {
  const db = await getDb();
  const scope = await scopePredicate(org);
  const ids = (await db.select({ id: contracts.id }).from(contracts).where(scope)).map((r) => r.id);
  if (!ids.length) return [];
  return db.query.payApplications.findMany({
    where: inArray(payApplications.contractId, ids),
    with: { contract: { columns: { id: true, trade: true, contractSumCents: true }, with: { project: { columns: { id: true, name: true } } } } },
    orderBy: [desc(payApplications.submittedAt), desc(payApplications.number)],
  });
}

/** This company's contracts with the billing state of each. */
export async function listBillableContracts(org: Organization) {
  const db = await getDb();
  const scope = await scopePredicate(org);
  const rows = await db.query.contracts.findMany({
    where: scope,
    with: { project: { with: { gc: true } }, payer: true, payApplications: { orderBy: [desc(payApplications.number)] } },
    orderBy: [desc(contracts.contractSumCents)],
  });
  return rows.map((c) => ({ ...c, billing: billingState(c, c.payApplications) }));
}

export type PayAppFormContext = NonNullable<Awaited<ReturnType<typeof payAppFormContext>>>;

/** Everything the billing form shows for one contract: the schedule of values with what was billed before, the rules that apply, and the lower tier. */
export async function payAppFormContext(org: Organization, contractId: string) {
  const contract = await getContract(org, contractId);
  if (!contract) return null;
  const db = await getDb();
  const accepted = contract.payApplications.filter((p) => ACCEPTED.includes(p.status));
  const priorLines = accepted.length
    ? await db.query.payApplicationLines.findMany({ where: inArray(payApplicationLines.payApplicationId, accepted.map((p) => p.id)) })
    : [];
  const active = contract.activeRuleSetId
    ? await db.query.ruleSets.findFirst({ where: and(eq(schema.ruleSets.id, contract.activeRuleSetId), eq(schema.ruleSets.contractId, contract.id)) })
    : null;
  const rules = active ? effectiveValues(active.rules as StoredRules) : null;
  const lowerTier = (await listLowerTier(db, contract.id)).map((c) => ({ id: c.id, name: c.sub.name, kind: c.lowerTierKind, remainingCents: c.remainingCents }));
  return {
    contract,
    billing: billingState(contract, contract.payApplications),
    lines: contract.sovLines.map((l) => ({
      id: l.id,
      lineNo: l.lineNo,
      description: l.description,
      scheduledValueCents: l.scheduledValueCents,
      previouslyCents: priorLines.filter((p) => p.sovLineId === l.id).reduce((s, p) => s + p.thisPeriodCents + p.storedCents, 0),
    })),
    previouslyBilledCents: accepted.reduce((s, p) => s + p.workThisPeriodCents + p.storedMaterialsCents, 0),
    retainageBps: rules?.retainage.percent_bps ?? null,
    storedMaterialsAllowed: rules?.stored_materials === true,
    lowerTier,
  };
}
