CREATE TABLE "github_repos" (
	"site_id" uuid PRIMARY KEY NOT NULL,
	"repo_url" text NOT NULL,
	"default_branch" text DEFAULT 'main' NOT NULL,
	"staging_branch" text
);
--> statement-breakpoint
CREATE TABLE "sanity_configs" (
	"site_id" uuid PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"prod_dataset" text NOT NULL,
	"staging_dataset" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"domain" text,
	"staging_domain" text,
	"ga4_property_id" text,
	"ga4_service_account_id" uuid,
	"analytics_recipients" text[] DEFAULT '{}' NOT NULL,
	"analytics_reports_enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "github_repos" ADD CONSTRAINT "github_repos_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sanity_configs" ADD CONSTRAINT "sanity_configs_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sites" ADD CONSTRAINT "sites_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sites" ADD CONSTRAINT "sites_ga4_service_account_id_fkey" FOREIGN KEY ("ga4_service_account_id") REFERENCES "public"."google_service_accounts"("id") ON DELETE no action ON UPDATE no action;