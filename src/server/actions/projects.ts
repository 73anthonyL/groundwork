/**
 * Creating a project: the contractor names the job, the owner who pays for it, the state whose
 * payment law governs it and the prime contract. Subcontracts are then added to it one at a time.
 */
import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db/client";
import { STATE_LAW } from "@/domain/statutes";
import { emit, type Actor } from "@/server/events";
import { slugify } from "@/server/actions/accounts";

export type ProjectField = "name" | "address" | "state" | "ownerName" | "primeContractSumCents" | "contractDate";

/** Project input a person can fix. `message` is safe to show; `field` says where. */
export class ProjectInputError extends Error {
  constructor(
    message: string,
    readonly field?: ProjectField,
  ) {
    super(message);
    this.name = "ProjectInputError";
  }
}

const isRealDate = (s: string) => {
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
};

const tidy = (s: string) => s.trim().replace(/\s+/g, " ");

const projectSchema = z.object({
  name: z.string("Name the project.").transform(tidy).pipe(z.string().min(2, "Name the project.").max(160, "That project name is too long.")),
  address: z
    .string()
    .nullish()
    .transform((s) => (s ? tidy(s) : ""))
    .pipe(z.string().max(300, "That address is too long.")),
  state: z
    .string("Choose the state the project is in.")
    .trim()
    .toUpperCase()
    .refine((s) => Object.hasOwn(STATE_LAW, s), "Choose the state the project is in."),
  ownerName: z.string("Name the owner who pays for the project.").transform(tidy).pipe(z.string().min(2, "Name the owner who pays for the project.").max(160, "That owner name is too long.")),
  primeContractSumCents: z
    .number("Enter the prime contract sum in dollars.")
    .int("Enter the prime contract sum in dollars.")
    .positive("Enter the prime contract sum in dollars.")
    .max(Number.MAX_SAFE_INTEGER, "Enter the prime contract sum in dollars."),
  contractDate: z
    .string("Enter the date of the prime contract.")
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter the date of the prime contract.")
    .refine(isRealDate, "Enter the date of the prime contract."),
});

/**
 * Creates a project for a general contractor, and its owner's organization when this contractor has
 * not worked for an owner of that name before. `contractDate` is YYYY-MM-DD; `state` is a two-letter
 * code from STATE_LAW. Throws ProjectInputError for anything a person can fix.
 */
export async function createProject(input: {
  gcOrgId: string;
  name: string;
  address?: string | null;
  state: string;
  ownerName: string;
  primeContractSumCents: number;
  contractDate: string;
  actor: Actor;
}): Promise<{ projectId: string; ownerOrgId: string; ownerCreated: boolean }> {
  const r = projectSchema.safeParse(input);
  if (!r.success) {
    const issue = r.error.issues[0];
    throw new ProjectInputError(issue.message, typeof issue.path[0] === "string" ? (issue.path[0] as ProjectField) : undefined);
  }
  const v = r.data;
  const db = await getDb();
  const projectId = randomUUID();
  return db.transaction(async (tx) => {
    const gc = await tx.query.organizations.findFirst({ where: and(eq(schema.organizations.id, input.gcOrgId), eq(schema.organizations.kind, "gc")) });
    if (!gc) throw new ProjectInputError("Only a general contractor can create a project.");
    if (input.actor.userId) {
      const member = await tx.query.users.findFirst({ where: and(eq(schema.users.id, input.actor.userId), eq(schema.users.orgId, gc.id)), columns: { id: true } });
      if (!member) throw new ProjectInputError("Only a general contractor can create a project.");
    }
    const [dup] = await tx
      .select({ id: schema.projects.id })
      .from(schema.projects)
      .where(and(eq(schema.projects.gcOrgId, gc.id), sql`lower(${schema.projects.name}) = ${v.name.toLowerCase()}`))
      .limit(1);
    if (dup) throw new ProjectInputError("You already have a project with that name.", "name");

    // An owner is reused only from this contractor's own projects: two contractors who both work for
    // "City Hospital" each get their own record of it, so neither can reach the other's.
    const [known] = await tx
      .select({ id: schema.organizations.id })
      .from(schema.projects)
      .innerJoin(schema.organizations, eq(schema.projects.ownerOrgId, schema.organizations.id))
      .where(and(eq(schema.projects.gcOrgId, gc.id), eq(schema.organizations.kind, "owner"), sql`lower(${schema.organizations.name}) = ${v.ownerName.toLowerCase()}`))
      .limit(1);
    let ownerOrgId = known?.id;
    const ownerCreated = !ownerOrgId;
    if (!ownerOrgId) {
      ownerOrgId = randomUUID();
      await tx.insert(schema.organizations).values({ id: ownerOrgId, kind: "owner", name: v.ownerName, slug: `${slugify(v.ownerName) || "owner"}-${ownerOrgId.slice(0, 6)}`, isDemo: gc.isDemo });
    }
    await tx.insert(schema.projects).values({
      id: projectId,
      gcOrgId: gc.id,
      ownerOrgId,
      name: v.name,
      address: v.address || null,
      state: v.state,
      contractDate: v.contractDate,
      // No project-specific cap: the engine takes the retention cap from the state's statute and each
      // subcontract's date (overlayFor), exactly as the sample projects do.
      retentionCapBps: null,
      primeContractSumCents: v.primeContractSumCents,
    });
    await emit(tx, {
      aggregateType: "project",
      aggregateId: projectId,
      type: "project.created",
      actor: input.actor,
      payload: { name: v.name, state: v.state, ownerOrgId, ownerName: v.ownerName, primeContractSumCents: v.primeContractSumCents, contractDate: v.contractDate },
      correlationId: projectId,
    });
    return { projectId, ownerOrgId, ownerCreated };
  });
}
