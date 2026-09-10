CREATE TABLE "google_drive_integrations" (
	"integration_id" uuid PRIMARY KEY NOT NULL,
	"google_service_account_id" uuid NOT NULL,
	"folder_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "google_service_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" text NOT NULL,
	"name" text,
	"description" text,
	"email" text NOT NULL,
	"key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "integrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" text NOT NULL,
	"type" text NOT NULL,
	"name" text,
	"description" text,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mailchimp_integrations" (
	"integration_id" uuid PRIMARY KEY NOT NULL,
	"api_key" text NOT NULL,
	"list_id" text NOT NULL,
	"server_prefix" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "slack_channels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"webhook_url" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "google_drive_integrations" ADD CONSTRAINT "google_drive_integrations_integration_id_fkey" FOREIGN KEY ("integration_id") REFERENCES "public"."integrations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "google_drive_integrations" ADD CONSTRAINT "google_drive_integrations_google_service_account_id_fkey" FOREIGN KEY ("google_service_account_id") REFERENCES "public"."google_service_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "google_service_accounts" ADD CONSTRAINT "google_service_accounts_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integrations" ADD CONSTRAINT "integrations_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mailchimp_integrations" ADD CONSTRAINT "mailchimp_integrations_integration_id_fkey" FOREIGN KEY ("integration_id") REFERENCES "public"."integrations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slack_channels" ADD CONSTRAINT "slack_channels_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clients" DROP COLUMN "default_email";