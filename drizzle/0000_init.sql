CREATE TYPE "public"."contract_status" AS ENUM('draft', 'compiling', 'in_review', 'active');--> statement-breakpoint
CREATE TYPE "public"."document_kind" AS ENUM('subcontract', 'pay_application', 'lien_waiver', 'other');--> statement-breakpoint
CREATE TYPE "public"."ledger_account" AS ENUM('owner_receipts', 'gc_cash', 'sub_payable', 'retainage_held', 'sub_paid');--> statement-breakpoint
CREATE TYPE "public"."org_kind" AS ENUM('owner', 'gc', 'sub');--> statement-breakpoint
CREATE TYPE "public"."pay_app_status" AS ENUM('draft', 'submitted', 'changes_requested', 'approved', 'funded', 'closed');--> statement-breakpoint
CREATE TYPE "public"."payment_event_source" AS ENUM('manual', 'webhook');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('created', 'held', 'released', 'paid', 'failed');--> statement-breakpoint
CREATE TYPE "public"."release_status" AS ENUM('planned', 'awaiting_waiver', 'waiver_signed', 'payment_initiated', 'paid', 'settled', 'blocked');--> statement-breakpoint
CREATE TYPE "public"."rule_set_status" AS ENUM('extracted', 'in_review', 'approved', 'superseded');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('admin', 'ap', 'pm', 'viewer');--> statement-breakpoint
CREATE TYPE "public"."waiver_form" AS ENUM('cp_8132', 'up_8134', 'cf_8136', 'uf_8138');--> statement-breakpoint
CREATE TYPE "public"."waiver_status" AS ENUM('drafted', 'sent', 'signed', 'void', 'superseded');--> statement-breakpoint
CREATE TABLE "contracts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"gc_org_id" uuid NOT NULL,
	"sub_org_id" uuid NOT NULL,
	"title" text NOT NULL,
	"trade" text NOT NULL,
	"contract_sum_cents" bigint NOT NULL,
	"executed_on" date NOT NULL,
	"document_id" uuid,
	"active_rule_set_id" uuid,
	"status" "contract_status" DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"kind" "document_kind" NOT NULL,
	"filename" text NOT NULL,
	"mime" text DEFAULT 'application/pdf' NOT NULL,
	"sha256" text NOT NULL,
	"bytes_b64" text NOT NULL,
	"byte_length" integer NOT NULL,
	"page_count" integer,
	"page_texts" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"aggregate_type" text NOT NULL,
	"aggregate_id" uuid NOT NULL,
	"type" text NOT NULL,
	"actor_user_id" uuid,
	"actor_label" text NOT NULL,
	"payload" jsonb NOT NULL,
	"correlation_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ledger_entries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"contract_id" uuid,
	"account" "ledger_account" NOT NULL,
	"delta_cents" bigint NOT NULL,
	"event_id" uuid NOT NULL,
	"correlation_id" uuid NOT NULL,
	"memo" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lien_waivers" (
	"id" uuid PRIMARY KEY NOT NULL,
	"release_id" uuid NOT NULL,
	"contract_id" uuid NOT NULL,
	"form" "waiver_form" NOT NULL,
	"status" "waiver_status" DEFAULT 'drafted' NOT NULL,
	"fields" jsonb NOT NULL,
	"document_id" uuid,
	"signer_user_id" uuid,
	"signer_name" text,
	"signer_title" text,
	"signed_at" timestamp with time zone,
	"signature_hash" text,
	"supersedes_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"kind" "org_kind" NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"license_no" text,
	"city" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organizations_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "owner_payment_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"amount_cents" bigint NOT NULL,
	"received_at" timestamp with time zone NOT NULL,
	"period_through" date NOT NULL,
	"reference" text NOT NULL,
	"includes_retention" boolean DEFAULT false NOT NULL,
	"idempotency_key" text NOT NULL,
	"source" "payment_event_source" DEFAULT 'manual' NOT NULL,
	"exclusions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"recorded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "owner_payment_events_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "pay_application_lines" (
	"id" uuid PRIMARY KEY NOT NULL,
	"pay_application_id" uuid NOT NULL,
	"sov_line_id" uuid NOT NULL,
	"previously_completed_cents" bigint DEFAULT 0 NOT NULL,
	"this_period_cents" bigint DEFAULT 0 NOT NULL,
	"stored_cents" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pay_applications" (
	"id" uuid PRIMARY KEY NOT NULL,
	"contract_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"period_through" date NOT NULL,
	"is_final" boolean DEFAULT false NOT NULL,
	"status" "pay_app_status" DEFAULT 'draft' NOT NULL,
	"work_this_period_cents" bigint DEFAULT 0 NOT NULL,
	"stored_materials_cents" bigint DEFAULT 0 NOT NULL,
	"previously_billed_cents" bigint DEFAULT 0 NOT NULL,
	"retainage_billed_cents" bigint DEFAULT 0 NOT NULL,
	"net_due_billed_cents" bigint DEFAULT 0 NOT NULL,
	"retainage_approved_cents" bigint,
	"net_due_approved_cents" bigint,
	"checks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"flags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"submitted_by" uuid,
	"submitted_at" timestamp with time zone,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"review_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"release_id" uuid NOT NULL,
	"rail" text NOT NULL,
	"external_bill_id" text,
	"status" "payment_status" DEFAULT 'created' NOT NULL,
	"amount_cents" bigint NOT NULL,
	"raw" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_release_id_unique" UNIQUE("release_id")
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY NOT NULL,
	"gc_org_id" uuid NOT NULL,
	"owner_org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"address" text,
	"state" text NOT NULL,
	"contract_date" date NOT NULL,
	"retention_cap_bps" integer,
	"prime_contract_sum_cents" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "releases" (
	"id" uuid PRIMARY KEY NOT NULL,
	"event_id" uuid NOT NULL,
	"pay_application_id" uuid NOT NULL,
	"contract_id" uuid NOT NULL,
	"gross_cents" bigint NOT NULL,
	"retainage_withheld_cents" bigint NOT NULL,
	"offset_cents" bigint DEFAULT 0 NOT NULL,
	"release_cents" bigint NOT NULL,
	"awaiting_owner_cents" bigint DEFAULT 0 NOT NULL,
	"basis" jsonb NOT NULL,
	"pay_by_at" timestamp with time zone,
	"retention_by_at" timestamp with time zone,
	"status" "release_status" DEFAULT 'planned' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rule_sets" (
	"id" uuid PRIMARY KEY NOT NULL,
	"contract_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"status" "rule_set_status" DEFAULT 'extracted' NOT NULL,
	"rules" jsonb NOT NULL,
	"model" text,
	"prompt_version" text,
	"extraction_ms" integer,
	"usage" jsonb,
	"reviewed_by" uuid,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"approved_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sov_lines" (
	"id" uuid PRIMARY KEY NOT NULL,
	"contract_id" uuid NOT NULL,
	"line_no" integer NOT NULL,
	"description" text NOT NULL,
	"scheduled_value_cents" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"title" text,
	"role" "user_role" DEFAULT 'viewer' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "webhook_inbox" (
	"id" uuid PRIMARY KEY NOT NULL,
	"rail" text NOT NULL,
	"external_event_id" text NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"error" text
);
--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_gc_org_id_organizations_id_fk" FOREIGN KEY ("gc_org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_sub_org_id_organizations_id_fk" FOREIGN KEY ("sub_org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_contract_id_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lien_waivers" ADD CONSTRAINT "lien_waivers_release_id_releases_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."releases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lien_waivers" ADD CONSTRAINT "lien_waivers_contract_id_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lien_waivers" ADD CONSTRAINT "lien_waivers_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lien_waivers" ADD CONSTRAINT "lien_waivers_signer_user_id_users_id_fk" FOREIGN KEY ("signer_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lien_waivers" ADD CONSTRAINT "lien_waivers_supersedes_id_lien_waivers_id_fk" FOREIGN KEY ("supersedes_id") REFERENCES "public"."lien_waivers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "owner_payment_events" ADD CONSTRAINT "owner_payment_events_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "owner_payment_events" ADD CONSTRAINT "owner_payment_events_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pay_application_lines" ADD CONSTRAINT "pay_application_lines_pay_application_id_pay_applications_id_fk" FOREIGN KEY ("pay_application_id") REFERENCES "public"."pay_applications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pay_application_lines" ADD CONSTRAINT "pay_application_lines_sov_line_id_sov_lines_id_fk" FOREIGN KEY ("sov_line_id") REFERENCES "public"."sov_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pay_applications" ADD CONSTRAINT "pay_applications_contract_id_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pay_applications" ADD CONSTRAINT "pay_applications_submitted_by_users_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pay_applications" ADD CONSTRAINT "pay_applications_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_release_id_releases_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."releases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_gc_org_id_organizations_id_fk" FOREIGN KEY ("gc_org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_owner_org_id_organizations_id_fk" FOREIGN KEY ("owner_org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "releases" ADD CONSTRAINT "releases_event_id_owner_payment_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."owner_payment_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "releases" ADD CONSTRAINT "releases_pay_application_id_pay_applications_id_fk" FOREIGN KEY ("pay_application_id") REFERENCES "public"."pay_applications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "releases" ADD CONSTRAINT "releases_contract_id_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rule_sets" ADD CONSTRAINT "rule_sets_contract_id_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rule_sets" ADD CONSTRAINT "rule_sets_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rule_sets" ADD CONSTRAINT "rule_sets_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sov_lines" ADD CONSTRAINT "sov_lines_contract_id_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "contracts_project_idx" ON "contracts" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "contracts_gc_idx" ON "contracts" USING btree ("gc_org_id");--> statement-breakpoint
CREATE INDEX "contracts_sub_idx" ON "contracts" USING btree ("sub_org_id");--> statement-breakpoint
CREATE INDEX "documents_org_idx" ON "documents" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "events_aggregate_idx" ON "events" USING btree ("aggregate_id");--> statement-breakpoint
CREATE INDEX "events_correlation_idx" ON "events" USING btree ("correlation_id");--> statement-breakpoint
CREATE INDEX "ledger_project_idx" ON "ledger_entries" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "ledger_contract_idx" ON "ledger_entries" USING btree ("contract_id");--> statement-breakpoint
CREATE INDEX "lien_waivers_release_idx" ON "lien_waivers" USING btree ("release_id");--> statement-breakpoint
CREATE INDEX "lien_waivers_contract_idx" ON "lien_waivers" USING btree ("contract_id");--> statement-breakpoint
CREATE INDEX "owner_payment_events_project_idx" ON "owner_payment_events" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pay_app_lines_uq" ON "pay_application_lines" USING btree ("pay_application_id","sov_line_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pay_apps_contract_number_uq" ON "pay_applications" USING btree ("contract_id","number");--> statement-breakpoint
CREATE INDEX "payments_external_idx" ON "payments" USING btree ("rail","external_bill_id");--> statement-breakpoint
CREATE INDEX "projects_gc_idx" ON "projects" USING btree ("gc_org_id");--> statement-breakpoint
CREATE INDEX "projects_owner_idx" ON "projects" USING btree ("owner_org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "releases_event_payapp_uq" ON "releases" USING btree ("event_id","pay_application_id");--> statement-breakpoint
CREATE INDEX "releases_contract_idx" ON "releases" USING btree ("contract_id");--> statement-breakpoint
CREATE UNIQUE INDEX "rule_sets_contract_version_uq" ON "rule_sets" USING btree ("contract_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "sov_lines_contract_line_uq" ON "sov_lines" USING btree ("contract_id","line_no");--> statement-breakpoint
CREATE INDEX "users_org_idx" ON "users" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_inbox_uq" ON "webhook_inbox" USING btree ("rail","external_event_id");