/** Append-only domain events and ledger postings. Always called inside the caller's transaction. */
import { randomUUID } from "node:crypto";
import { schema } from "@/db/client";
import type { DbLike } from "./db-types";
import type { LedgerEntry } from "@/db/schema";

export type Actor = { userId: string | null; label: string };

export async function emit(
  tx: DbLike,
  e: { aggregateType: string; aggregateId: string; type: string; actor: Actor; payload: unknown; correlationId: string },
): Promise<string> {
  const id = randomUUID();
  await tx.insert(schema.events).values({
    id,
    aggregateType: e.aggregateType,
    aggregateId: e.aggregateId,
    type: e.type,
    actorUserId: e.actor.userId,
    actorLabel: e.actor.label,
    payload: e.payload as object,
    correlationId: e.correlationId,
  });
  return id;
}

export async function post(
  tx: DbLike,
  entries: Omit<LedgerEntry, "id" | "createdAt">[],
): Promise<void> {
  if (!entries.length) return;
  await tx.insert(schema.ledgerEntries).values(entries.map((e) => ({ ...e, id: randomUUID() })));
}

export const SYSTEM: Actor = { userId: null, label: "Groundwork engine" };
