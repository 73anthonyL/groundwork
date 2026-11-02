/**
 * Groundwork domain model.
 *
 * Money is stored as integer cents (bigint, read as number). Append-only tables are marked ◆.
 * Rule sets are never edited after approval; edits create a new version.
 */
import {
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  bigint,
  boolean,
  timestamp,
  date,
  jsonb,
  uniqueIndex,
  index,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";

// ─── Enums ──────────────────────────────────────────────────────────────────

export const orgKind = pgEnum("org_kind", ["owner", "gc", "sub"]);
export const userRole = pgEnum("user_role", ["admin", "ap", "pm", "viewer"]);
export const contractStatus = pgEnum("contract_status", ["draft", "compiling", "in_review", "active"]);
export const documentKind = pgEnum("document_kind", ["subcontract", "pay_application", "lien_waiver", "other"]);
export const ruleSetStatus = pgEnum("rule_set_status", ["extracted", "in_review", "approved", "superseded"]);
export const payAppStatus = pgEnum("pay_app_status", [
  "draft",
  "submitted",
  "changes_requested",
  "approved",
  "funded",
  "closed",
]);
export const paymentEventSource = pgEnum("payment_event_source", ["manual", "webhook"]);
export const releaseStatus = pgEnum("release_status", [
  "planned",
  "awaiting_waiver",
  "waiver_signed",
  "payment_initiated",
  "paid",
  "settled",
  "blocked",
]);
export const waiverForm = pgEnum("waiver_form", ["cp_8132", "up_8134", "cf_8136", "uf_8138"]);
export const waiverStatus = pgEnum("waiver_status", ["drafted", "sent", "signed", "void", "superseded"]);
export const paymentStatus = pgEnum("payment_status", ["created", "held", "released", "paid", "failed"]);
export const ledgerAccount = pgEnum("ledger_account", [
  "owner_receipts",
  "gc_cash",
  "sub_payable",
  "retainage_held",
  "sub_paid",
]);

const cents = (name: string) => bigint(name, { mode: "number" });
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

// ─── Parties ────────────────────────────────────────────────────────────────

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey(),
  kind: orgKind("kind").notNull(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  licenseNo: text("license_no"),
  city: text("city"),
  createdAt: createdAt(),
});

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    name: text("name").notNull(),
    email: text("email").notNull().unique(),
    title: text("title"),
    role: userRole("role").notNull().default("viewer"),
    createdAt: createdAt(),
  },
  (t) => [index("users_org_idx").on(t.orgId)],
);

// ─── Projects & contracts ───────────────────────────────────────────────────

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey(),
    gcOrgId: uuid("gc_org_id")
      .notNull()
      .references(() => organizations.id),
    ownerOrgId: uuid("owner_org_id")
      .notNull()
      .references(() => organizations.id),
    name: text("name").notNull(),
    address: text("address"),
    /** Governing state for the statutory overlay, e.g. "CA". */
    state: text("state").notNull(),
    /** Prime contract date; drives Civ. Code §8811 (5% cap for CA contracts on/after 2026-01-01). */
    contractDate: date("contract_date").notNull(),
    retentionCapBps: integer("retention_cap_bps"),
    primeContractSumCents: cents("prime_contract_sum_cents").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("projects_gc_idx").on(t.gcOrgId), index("projects_owner_idx").on(t.ownerOrgId)],
);

export const documents = pgTable(
  "documents",
  {
    id: uuid("id").primaryKey(),
    /** Org that uploaded/owns the file; access is additionally granted through the contract it belongs to. */
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    kind: documentKind("kind").notNull(),
    filename: text("filename").notNull(),
    mime: text("mime").notNull().default("application/pdf"),
    sha256: text("sha256").notNull(),
    /** Base64 body. Portable across neon-http and PGlite without bytea quirks. */
    bytesB64: text("bytes_b64").notNull(),
    byteLength: integer("byte_length").notNull(),
    pageCount: integer("page_count"),
    /** Per-page extracted text, index 0 = page 1. Empty strings mean a scanned page. */
    pageTexts: jsonb("page_texts").$type<string[]>(),
    createdAt: createdAt(),
  },
  (t) => [index("documents_org_idx").on(t.orgId)],
);

export const contracts = pgTable(
  "contracts",
  {
    id: uuid("id").primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    gcOrgId: uuid("gc_org_id")
      .notNull()
      .references(() => organizations.id),
    subOrgId: uuid("sub_org_id")
      .notNull()
      .references(() => organizations.id),
    title: text("title").notNull(),
    trade: text("trade").notNull(),
    contractSumCents: cents("contract_sum_cents").notNull(),
    executedOn: date("executed_on").notNull(),
    documentId: uuid("document_id").references(() => documents.id),
    /** Set only when a rule set reaches `approved`. No FK to avoid a cycle; enforced in code. */
    activeRuleSetId: uuid("active_rule_set_id"),
    status: contractStatus("status").notNull().default("draft"),
    createdAt: createdAt(),
  },
  (t) => [
    index("contracts_project_idx").on(t.projectId),
    index("contracts_gc_idx").on(t.gcOrgId),
    index("contracts_sub_idx").on(t.subOrgId),
  ],
);

export const ruleSets = pgTable(
  "rule_sets",
  {
    id: uuid("id").primaryKey(),
    contractId: uuid("contract_id")
      .notNull()
      .references(() => contracts.id),
    version: integer("version").notNull(),
    status: ruleSetStatus("status").notNull().default("extracted"),
    /** Typed rule set: every field carries value, evidence, verification and review (see src/domain/rules). */
    rules: jsonb("rules").notNull(),
    model: text("model"),
    promptVersion: text("prompt_version"),
    extractionMs: integer("extraction_ms"),
    usage: jsonb("usage"),
    reviewedBy: uuid("reviewed_by").references(() => users.id),
    approvedBy: uuid("approved_by").references(() => users.id),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    /** sha256 of the canonical approved rules JSON; shown on the UI as the lock hash. */
    approvedHash: text("approved_hash"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("rule_sets_contract_version_uq").on(t.contractId, t.version)],
);

export const sovLines = pgTable(
  "sov_lines",
  {
    id: uuid("id").primaryKey(),
    contractId: uuid("contract_id")
      .notNull()
      .references(() => contracts.id),
    lineNo: integer("line_no").notNull(),
    description: text("description").notNull(),
    scheduledValueCents: cents("scheduled_value_cents").notNull(),
  },
  (t) => [uniqueIndex("sov_lines_contract_line_uq").on(t.contractId, t.lineNo)],
);

// ─── Pay applications (G702/G703-shaped) ────────────────────────────────────

export const payApplications = pgTable(
  "pay_applications",
  {
    id: uuid("id").primaryKey(),
    contractId: uuid("contract_id")
      .notNull()
      .references(() => contracts.id),
    number: integer("number").notNull(),
    periodThrough: date("period_through").notNull(),
    isFinal: boolean("is_final").notNull().default(false),
    status: payAppStatus("status").notNull().default("draft"),
    /** As billed by the sub. */
    workThisPeriodCents: cents("work_this_period_cents").notNull().default(0),
    storedMaterialsCents: cents("stored_materials_cents").notNull().default(0),
    previouslyBilledCents: cents("previously_billed_cents").notNull().default(0),
    retainageBilledCents: cents("retainage_billed_cents").notNull().default(0),
    netDueBilledCents: cents("net_due_billed_cents").notNull().default(0),
    /** As corrected by the GC on approval (nullable until approved). */
    retainageApprovedCents: cents("retainage_approved_cents"),
    netDueApprovedCents: cents("net_due_approved_cents"),
    /** Deterministic check results and LLM-phrased flags. */
    checks: jsonb("checks").$type<unknown[]>().notNull().default(sql`'[]'::jsonb`),
    flags: jsonb("flags").$type<unknown[]>().notNull().default(sql`'[]'::jsonb`),
    submittedBy: uuid("submitted_by").references(() => users.id),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    reviewedBy: uuid("reviewed_by").references(() => users.id),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewNote: text("review_note"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("pay_apps_contract_number_uq").on(t.contractId, t.number)],
);

export const payApplicationLines = pgTable(
  "pay_application_lines",
  {
    id: uuid("id").primaryKey(),
    payApplicationId: uuid("pay_application_id")
      .notNull()
      .references(() => payApplications.id),
    sovLineId: uuid("sov_line_id")
      .notNull()
      .references(() => sovLines.id),
    previouslyCompletedCents: cents("previously_completed_cents").notNull().default(0),
    thisPeriodCents: cents("this_period_cents").notNull().default(0),
    storedCents: cents("stored_cents").notNull().default(0),
  },
  (t) => [uniqueIndex("pay_app_lines_uq").on(t.payApplicationId, t.sovLineId)],
);

// ─── Execution ──────────────────────────────────────────────────────────────

/** ◆ Owner payment events. Idempotent by key. */
export const ownerPaymentEvents = pgTable(
  "owner_payment_events",
  {
    id: uuid("id").primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    amountCents: cents("amount_cents").notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull(),
    periodThrough: date("period_through").notNull(),
    reference: text("reference").notNull(),
    includesRetention: boolean("includes_retention").notNull().default(false),
    idempotencyKey: text("idempotency_key").notNull().unique(),
    source: paymentEventSource("source").notNull().default("manual"),
    /** Pay-application ids the GC pinned out of this allocation. */
    exclusions: jsonb("exclusions").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    recordedBy: uuid("recorded_by").references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [index("owner_payment_events_project_idx").on(t.projectId)],
);

export const releases = pgTable(
  "releases",
  {
    id: uuid("id").primaryKey(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => ownerPaymentEvents.id),
    payApplicationId: uuid("pay_application_id")
      .notNull()
      .references(() => payApplications.id),
    contractId: uuid("contract_id")
      .notNull()
      .references(() => contracts.id),
    grossCents: cents("gross_cents").notNull(),
    retainageWithheldCents: cents("retainage_withheld_cents").notNull(),
    offsetCents: cents("offset_cents").notNull().default(0),
    releaseCents: cents("release_cents").notNull(),
    awaitingOwnerCents: cents("awaiting_owner_cents").notNull().default(0),
    /** Rule paths, statute ids and the arithmetic that produced the numbers. */
    basis: jsonb("basis").notNull(),
    /** Null only when no statute is loaded for the state and the contract is silent. */
    payByAt: timestamp("pay_by_at", { withTimezone: true }),
    retentionByAt: timestamp("retention_by_at", { withTimezone: true }),
    status: releaseStatus("status").notNull().default("planned"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("releases_event_payapp_uq").on(t.eventId, t.payApplicationId),
    index("releases_contract_idx").on(t.contractId),
  ],
);

export const lienWaivers = pgTable(
  "lien_waivers",
  {
    id: uuid("id").primaryKey(),
    releaseId: uuid("release_id")
      .notNull()
      .references(() => releases.id),
    contractId: uuid("contract_id")
      .notNull()
      .references(() => contracts.id),
    form: waiverForm("form").notNull(),
    status: waiverStatus("status").notNull().default("drafted"),
    /** The statutory form fields (claimant, customer, job location, owner, through date, amount, exceptions…). */
    fields: jsonb("fields").notNull(),
    documentId: uuid("document_id").references(() => documents.id),
    signerUserId: uuid("signer_user_id").references(() => users.id),
    signerName: text("signer_name"),
    signerTitle: text("signer_title"),
    signedAt: timestamp("signed_at", { withTimezone: true }),
    /** sha256(waiverId ‖ canonical fields ‖ signerName ‖ signedAt). */
    signatureHash: text("signature_hash"),
    supersedesId: uuid("supersedes_id").references((): AnyPgColumn => lienWaivers.id),
    createdAt: createdAt(),
  },
  (t) => [index("lien_waivers_release_idx").on(t.releaseId), index("lien_waivers_contract_idx").on(t.contractId)],
);

export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey(),
    releaseId: uuid("release_id")
      .notNull()
      .unique()
      .references(() => releases.id),
    rail: text("rail").notNull(),
    externalBillId: text("external_bill_id"),
    status: paymentStatus("status").notNull().default("created"),
    amountCents: cents("amount_cents").notNull(),
    raw: jsonb("raw"),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("payments_external_idx").on(t.rail, t.externalBillId)],
);

/** ◆ Domain events. Doubles as the audit trail. */
export const events = pgTable(
  "events",
  {
    id: uuid("id").primaryKey(),
    aggregateType: text("aggregate_type").notNull(),
    aggregateId: uuid("aggregate_id").notNull(),
    type: text("type").notNull(),
    actorUserId: uuid("actor_user_id"),
    actorLabel: text("actor_label").notNull(),
    payload: jsonb("payload").notNull(),
    correlationId: uuid("correlation_id").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("events_aggregate_idx").on(t.aggregateId), index("events_correlation_idx").on(t.correlationId)],
);

/** ◆ Ledger. Balances are SUM(delta_cents) per account. */
export const ledgerEntries = pgTable(
  "ledger_entries",
  {
    id: uuid("id").primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    contractId: uuid("contract_id").references(() => contracts.id),
    account: ledgerAccount("account").notNull(),
    deltaCents: cents("delta_cents").notNull(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id),
    correlationId: uuid("correlation_id").notNull(),
    memo: text("memo").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("ledger_project_idx").on(t.projectId), index("ledger_contract_idx").on(t.contractId)],
);

/** ◆ Webhook inbox. Duplicate deliveries are no-ops. */
export const webhookInbox = pgTable(
  "webhook_inbox",
  {
    id: uuid("id").primaryKey(),
    rail: text("rail").notNull(),
    externalEventId: text("external_event_id").notNull(),
    payload: jsonb("payload").notNull(),
    receivedAt: createdAt(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    error: text("error"),
  },
  (t) => [uniqueIndex("webhook_inbox_uq").on(t.rail, t.externalEventId)],
);

// ─── Relations (for db.query) ───────────────────────────────────────────────

export const organizationsRelations = relations(organizations, ({ many }) => ({
  users: many(users),
}));

export const usersRelations = relations(users, ({ one }) => ({
  org: one(organizations, { fields: [users.orgId], references: [organizations.id] }),
}));

export const projectsRelations = relations(projects, ({ one, many }) => ({
  gc: one(organizations, { fields: [projects.gcOrgId], references: [organizations.id], relationName: "project_gc" }),
  owner: one(organizations, {
    fields: [projects.ownerOrgId],
    references: [organizations.id],
    relationName: "project_owner",
  }),
  contracts: many(contracts),
  ownerPaymentEvents: many(ownerPaymentEvents),
}));

export const contractsRelations = relations(contracts, ({ one, many }) => ({
  project: one(projects, { fields: [contracts.projectId], references: [projects.id] }),
  sub: one(organizations, { fields: [contracts.subOrgId], references: [organizations.id] }),
  document: one(documents, { fields: [contracts.documentId], references: [documents.id] }),
  ruleSets: many(ruleSets),
  sovLines: many(sovLines),
  payApplications: many(payApplications),
  releases: many(releases),
}));

export const ruleSetsRelations = relations(ruleSets, ({ one }) => ({
  contract: one(contracts, { fields: [ruleSets.contractId], references: [contracts.id] }),
}));

export const sovLinesRelations = relations(sovLines, ({ one }) => ({
  contract: one(contracts, { fields: [sovLines.contractId], references: [contracts.id] }),
}));

export const payApplicationsRelations = relations(payApplications, ({ one, many }) => ({
  contract: one(contracts, { fields: [payApplications.contractId], references: [contracts.id] }),
  lines: many(payApplicationLines),
  releases: many(releases),
}));

export const payApplicationLinesRelations = relations(payApplicationLines, ({ one }) => ({
  payApplication: one(payApplications, {
    fields: [payApplicationLines.payApplicationId],
    references: [payApplications.id],
  }),
  sovLine: one(sovLines, { fields: [payApplicationLines.sovLineId], references: [sovLines.id] }),
}));

export const ownerPaymentEventsRelations = relations(ownerPaymentEvents, ({ one, many }) => ({
  project: one(projects, { fields: [ownerPaymentEvents.projectId], references: [projects.id] }),
  releases: many(releases),
}));

export const releasesRelations = relations(releases, ({ one, many }) => ({
  event: one(ownerPaymentEvents, { fields: [releases.eventId], references: [ownerPaymentEvents.id] }),
  payApplication: one(payApplications, { fields: [releases.payApplicationId], references: [payApplications.id] }),
  contract: one(contracts, { fields: [releases.contractId], references: [contracts.id] }),
  waivers: many(lienWaivers),
  payment: one(payments, { fields: [releases.id], references: [payments.releaseId] }),
}));

export const lienWaiversRelations = relations(lienWaivers, ({ one }) => ({
  release: one(releases, { fields: [lienWaivers.releaseId], references: [releases.id] }),
  document: one(documents, { fields: [lienWaivers.documentId], references: [documents.id] }),
}));

export const paymentsRelations = relations(payments, ({ one }) => ({
  release: one(releases, { fields: [payments.releaseId], references: [releases.id] }),
}));

// ─── Row types ──────────────────────────────────────────────────────────────

export type Organization = typeof organizations.$inferSelect;
export type User = typeof users.$inferSelect;
export type Project = typeof projects.$inferSelect;
export type Contract = typeof contracts.$inferSelect;
export type Document = typeof documents.$inferSelect;
export type RuleSetRow = typeof ruleSets.$inferSelect;
export type SovLine = typeof sovLines.$inferSelect;
export type PayApplication = typeof payApplications.$inferSelect;
export type PayApplicationLine = typeof payApplicationLines.$inferSelect;
export type OwnerPaymentEvent = typeof ownerPaymentEvents.$inferSelect;
export type Release = typeof releases.$inferSelect;
export type LienWaiver = typeof lienWaivers.$inferSelect;
export type Payment = typeof payments.$inferSelect;
export type DomainEvent = typeof events.$inferSelect;
export type LedgerEntry = typeof ledgerEntries.$inferSelect;
