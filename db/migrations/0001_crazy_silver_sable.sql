ALTER TABLE "clients" ADD COLUMN "sanity_project_id" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "sanity_production_dataset" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "sanity_staging_dataset" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "github_repo" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "github_default_branch" text DEFAULT 'main';--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "github_test_branch" text;