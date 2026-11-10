CREATE TYPE "public"."backcharge_status" AS ENUM('open', 'void');--> statement-breakpoint
CREATE TYPE "public"."change_order_status" AS ENUM('proposed', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."release_kind" AS ENUM('progress', 'retention');--> statement-breakpoint
ALTER TYPE "public"."ledger_account" ADD VALUE 'backcharge_recovered';--> statement-breakpoint
ALTER TYPE "public"."ledger_account" ADD VALUE 'lower_tier_payable';--> statement-breakpoint
ALTER TYPE "public"."ledger_account" ADD VALUE 'lower_tier_paid';--> statement-breakpoint
ALTER TYPE "public"."payment_event_source" ADD VALUE 'cascade';--> statement-breakpoint
CREATE TABLE "backcharges" (
	"id" uuid PRIMARY KEY NOT NULL,
	"contract_id" uuid NOT NULL,
	"amount_cents" bigint NOT NULL,
	"reason" text NOT NULL,
	"notice_date" date,
	"status" "backcharge_status" DEFAULT 'open' NOT NULL,
	"created_by" uuid,
	"voided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "change_orders" (
	"id" uuid PRIMARY KEY NOT NULL,
	"contract_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"amount_cents" bigint NOT NULL,
	"sov_line_id" uuid,
	"status" "change_order_status" DEFAULT 'proposed' NOT NULL,
	"requested_by" uuid,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"decision_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "retention_certifications" (
	"id" uuid PRIMARY KEY NOT NULL,
	"contract_id" uuid NOT NULL,
	"release_bps" integer NOT NULL,
	"amount_cents" bigint NOT NULL,
	"condition_text" text,
	"note" text NOT NULL,
	"is_final" boolean DEFAULT false NOT NULL,
	"certified_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "releases" ALTER COLUMN "pay_application_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "contracts" ADD COLUMN "parent_contract_id" uuid;--> statement-breakpoint
ALTER TABLE "contracts" ADD COLUMN "lower_tier_kind" text;--> statement-breakpoint
ALTER TABLE "lien_waivers" ADD COLUMN "sign_token" text;--> statement-breakpoint
ALTER TABLE "owner_payment_events" ADD COLUMN "retention_cents" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "owner_payment_events" ADD COLUMN "payer_contract_id" uuid;--> statement-breakpoint
ALTER TABLE "owner_payment_events" ADD COLUMN "parent_release_id" uuid;--> statement-breakpoint
ALTER TABLE "pay_applications" ADD COLUMN "lower_tier" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "pay_applications" ADD COLUMN "parent_pay_application_id" uuid;--> statement-breakpoint
ALTER TABLE "releases" ADD COLUMN "kind" "release_kind" DEFAULT 'progress' NOT NULL;--> statement-breakpoint
ALTER TABLE "releases" ADD COLUMN "certification_id" uuid;--> statement-breakpoint
ALTER TABLE "backcharges" ADD CONSTRAINT "backcharges_contract_id_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "backcharges" ADD CONSTRAINT "backcharges_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_orders" ADD CONSTRAINT "change_orders_contract_id_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_orders" ADD CONSTRAINT "change_orders_sov_line_id_sov_lines_id_fk" FOREIGN KEY ("sov_line_id") REFERENCES "public"."sov_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_orders" ADD CONSTRAINT "change_orders_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_orders" ADD CONSTRAINT "change_orders_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retention_certifications" ADD CONSTRAINT "retention_certifications_contract_id_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retention_certifications" ADD CONSTRAINT "retention_certifications_certified_by_users_id_fk" FOREIGN KEY ("certified_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "backcharges_contract_idx" ON "backcharges" USING btree ("contract_id");--> statement-breakpoint
CREATE UNIQUE INDEX "change_orders_contract_number_uq" ON "change_orders" USING btree ("contract_id","number");--> statement-breakpoint
CREATE INDEX "retention_certs_contract_idx" ON "retention_certifications" USING btree ("contract_id");--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_parent_contract_id_contracts_id_fk" FOREIGN KEY ("parent_contract_id") REFERENCES "public"."contracts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "owner_payment_events" ADD CONSTRAINT "owner_payment_events_payer_contract_id_contracts_id_fk" FOREIGN KEY ("payer_contract_id") REFERENCES "public"."contracts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "owner_payment_events" ADD CONSTRAINT "owner_payment_events_parent_release_id_releases_id_fk" FOREIGN KEY ("parent_release_id") REFERENCES "public"."releases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pay_applications" ADD CONSTRAINT "pay_applications_parent_pay_application_id_pay_applications_id_fk" FOREIGN KEY ("parent_pay_application_id") REFERENCES "public"."pay_applications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "releases" ADD CONSTRAINT "releases_certification_id_retention_certifications_id_fk" FOREIGN KEY ("certification_id") REFERENCES "public"."retention_certifications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "contracts_parent_idx" ON "contracts" USING btree ("parent_contract_id");--> statement-breakpoint
CREATE UNIQUE INDEX "releases_event_cert_uq" ON "releases" USING btree ("event_id","certification_id");--> statement-breakpoint
ALTER TABLE "lien_waivers" ADD CONSTRAINT "lien_waivers_sign_token_unique" UNIQUE("sign_token");