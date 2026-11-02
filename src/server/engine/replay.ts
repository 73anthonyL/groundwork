/** Re-run the planner over every owner payment from an empty ledger and compare with what was stored. */
import { asc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { planWaterfall } from "@/domain/waterfall/engine";
import { loadCandidates } from "@/server/actions/owner-payment";

export async function replayProject(projectId: string) {
  const db = await getDb();
  const events = await db.query.ownerPaymentEvents.findMany({ where: eq(schema.ownerPaymentEvents.projectId, projectId), orderBy: [asc(schema.ownerPaymentEvents.createdAt)] });
  const mismatches: string[] = [];
  let compared = 0;
  for (const ev of events) {
    const candidates = await loadCandidates(db, projectId, ev.id);
    const plan = planWaterfall(
      { eventId: ev.id, amountCents: ev.amountCents, receivedAt: ev.receivedAt, periodThrough: ev.periodThrough, includesRetention: ev.includesRetention, exclusions: ev.exclusions },
      candidates,
    );
    const stored = await db.query.releases.findMany({ where: eq(schema.releases.eventId, ev.id) });
    for (const r of plan.releases) {
      const s = stored.find((x) => x.payApplicationId === r.payAppId);
      compared++;
      if (!s) mismatches.push(`${ev.reference}: no stored release for ${r.payAppId}`);
      else if (s.grossCents !== r.grossCents || s.retainageWithheldCents !== r.retainageWithheldCents || s.releaseCents !== r.releaseCents)
        mismatches.push(`${ev.reference}/${r.payAppId}: planned ${r.grossCents}/${r.retainageWithheldCents}/${r.releaseCents} vs stored ${s.grossCents}/${s.retainageWithheldCents}/${s.releaseCents}`);
    }
    if (stored.length !== plan.releases.length) mismatches.push(`${ev.reference}: ${stored.length} stored vs ${plan.releases.length} planned`);
  }
  return { events: events.length, compared, mismatches };
}
