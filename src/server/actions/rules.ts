/**
 * Rule-set lifecycle: extracted → in_review → approved (frozen) → superseded by the next version.
 * Plain async functions so scripts, tests and server actions share one path.
 */
import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { RULE_FIELDS, overrideError, type ExtractedRuleSet, type RuleFieldPath } from "@/domain/rules/schema";
import { annotate, approvedHash, blockingFields, unacknowledgedAnomalies, type StoredRules } from "@/server/rules/review";
import { emit, type Actor } from "@/server/events";
import { now } from "@/server/clock";

export async function createRuleSet(input: {
  contractId: string;
  extracted: ExtractedRuleSet;
  pageTexts: string[];
  model: string;
  promptVersion: string;
  extractionMs: number;
  usage?: unknown;
  actor: Actor;
  id?: string;
}) {
  const db = await getDb();
  return db.transaction(async (tx) => {
    const contract = await tx.query.contracts.findFirst({
      where: eq(schema.contracts.id, input.contractId),
      with: { project: true },
    });
    if (!contract) throw new Error("contract not found");
    const [latest] = await tx
      .select({ version: schema.ruleSets.version })
      .from(schema.ruleSets)
      .where(eq(schema.ruleSets.contractId, input.contractId))
      .orderBy(desc(schema.ruleSets.version))
      .limit(1);
    const version = (latest?.version ?? 0) + 1;
    const stored = annotate(input.extracted, input.pageTexts, contract.project.state, contract.executedOn);
    const clean = blockingFields(stored).length === 0 && unacknowledgedAnomalies(stored).length === 0;
    const id = input.id ?? randomUUID();
    await tx.insert(schema.ruleSets).values({
      id,
      contractId: input.contractId,
      version,
      status: clean ? "extracted" : "in_review",
      rules: stored,
      model: input.model,
      promptVersion: input.promptVersion,
      extractionMs: input.extractionMs,
      usage: input.usage as object | undefined,
    });
    await tx.update(schema.contracts).set({ status: "in_review" }).where(eq(schema.contracts.id, input.contractId));
    const correlationId = randomUUID();
    await emit(tx, {
      aggregateType: "contract",
      aggregateId: input.contractId,
      type: "rules.extracted",
      actor: input.actor,
      payload: { ruleSetId: id, version, blocking: blockingFields(stored), anomalies: stored.extracted.anomalies.length },
      correlationId,
    });
    return { id, version, stored };
  });
}

/** Reviewer accepts a flagged field as-is, or overrides its value, with a note. */
export async function resolveField(input: {
  ruleSetId: string;
  path: RuleFieldPath;
  decision: "accept" | "override";
  value?: unknown;
  note: string;
  actor: Actor;
}) {
  if (!RULE_FIELDS.includes(input.path)) throw new Error("that term is not part of the payment rules");
  if (input.decision === "override") {
    const problem = overrideError(input.path, input.value);
    if (problem) throw new Error(problem);
  }
  const db = await getDb();
  return db.transaction(async (tx) => {
    const row = await tx.query.ruleSets.findFirst({ where: eq(schema.ruleSets.id, input.ruleSetId) });
    if (!row) throw new Error("rule set not found");
    if (row.status === "approved" || row.status === "superseded") throw new Error("these payment rules are approved and can no longer be changed; read the subcontract again to start a new version");
    const stored = row.rules as StoredRules;
    const ann = stored.annotations[input.path];
    ann.review =
      input.decision === "accept"
        ? { state: "accepted", reasons: ann.review.reasons, override: null }
        : {
            state: "overridden",
            reasons: ann.review.reasons,
            override: { value: input.value, note: input.note, by: input.actor.label, at: now().toISOString() },
          };
    await tx.update(schema.ruleSets).set({ rules: stored, status: "in_review", reviewedBy: input.actor.userId }).where(eq(schema.ruleSets.id, row.id));
    await emit(tx, {
      aggregateType: "contract",
      aggregateId: row.contractId,
      type: input.decision === "accept" ? "rules.field_accepted" : "rules.field_overridden",
      actor: input.actor,
      payload: { ruleSetId: row.id, path: input.path, value: input.value ?? null, note: input.note },
      correlationId: randomUUID(),
    });
    return stored;
  });
}

export async function acknowledgeAnomaly(input: { ruleSetId: string; index: number; note: string; actor: Actor }) {
  const db = await getDb();
  return db.transaction(async (tx) => {
    const row = await tx.query.ruleSets.findFirst({ where: eq(schema.ruleSets.id, input.ruleSetId) });
    if (!row) throw new Error("rule set not found");
    if (row.status === "approved" || row.status === "superseded") throw new Error("these payment rules are approved and can no longer be changed");
    const stored = row.rules as StoredRules;
    if (!Number.isInteger(input.index) || input.index < 0 || input.index >= stored.extracted.anomalies.length) throw new Error("there is no such note on these payment rules");
    stored.anomalyAcks[input.index] = { note: input.note, by: input.actor.label, at: now().toISOString() };
    await tx.update(schema.ruleSets).set({ rules: stored }).where(eq(schema.ruleSets.id, row.id));
    await emit(tx, {
      aggregateType: "contract",
      aggregateId: row.contractId,
      type: "rules.anomaly_acknowledged",
      actor: input.actor,
      payload: { ruleSetId: row.id, index: input.index, note: input.note },
      correlationId: randomUUID(),
    });
    return stored;
  });
}

/** Freeze the rule set. Refuses while any field is unresolved. */
export async function approveRuleSet(input: { ruleSetId: string; actor: Actor }) {
  const db = await getDb();
  return db.transaction(async (tx) => {
    const row = await tx.query.ruleSets.findFirst({ where: eq(schema.ruleSets.id, input.ruleSetId) });
    if (!row) throw new Error("rule set not found");
    if (row.status === "approved") return { hash: row.approvedHash!, alreadyApproved: true };
    if (row.status === "superseded") throw new Error("superseded rule sets cannot be approved");
    const stored = row.rules as StoredRules;
    const blocking = blockingFields(stored);
    const anomalies = unacknowledgedAnomalies(stored);
    if (blocking.length || anomalies.length) {
      throw new Error(`cannot approve: unresolved ${[...blocking, ...anomalies.map((i) => `anomaly#${i}`)].join(", ")}`);
    }
    const hash = approvedHash(stored);
    const at = now();
    await tx
      .update(schema.ruleSets)
      .set({ status: "superseded" })
      .where(and(eq(schema.ruleSets.contractId, row.contractId), eq(schema.ruleSets.status, "approved")));
    await tx
      .update(schema.ruleSets)
      .set({ status: "approved", approvedBy: input.actor.userId, approvedAt: at, approvedHash: hash })
      .where(eq(schema.ruleSets.id, row.id));
    await tx.update(schema.contracts).set({ status: "active", activeRuleSetId: row.id }).where(eq(schema.contracts.id, row.contractId));
    await emit(tx, {
      aggregateType: "contract",
      aggregateId: row.contractId,
      type: "rules.approved",
      actor: input.actor,
      payload: { ruleSetId: row.id, version: row.version, hash },
      correlationId: randomUUID(),
    });
    return { hash, alreadyApproved: false };
  });
}
