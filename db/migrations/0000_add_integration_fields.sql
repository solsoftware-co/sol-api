ALTER TABLE "clients" ADD COLUMN "sanity_project_id" text;
ALTER TABLE "clients" ADD COLUMN "sanity_production_dataset" text;
ALTER TABLE "clients" ADD COLUMN "sanity_staging_dataset" text;
ALTER TABLE "clients" ADD COLUMN "github_repo" text;
ALTER TABLE "clients" ADD COLUMN "github_default_branch" text DEFAULT 'main';
ALTER TABLE "clients" ADD COLUMN "github_test_branch" text;
