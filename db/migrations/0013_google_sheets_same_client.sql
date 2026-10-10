-- SOL-50: a Google Sheets integration can only use its own client's
-- service account, guaranteed by the database (docs/design/data-model.md).
-- Until now google_sheets_integrations referenced google_service_accounts by
-- id alone, so nothing stopped one client's integration pointing at another
-- client's Google credentials. This applies the Wave 3 pattern: the table
-- carries its own client_id with composite FKs to both sides.
--
-- Hand-assembled from drizzle-kit's output and wrapped in one DO block so it
-- applies atomically (see 0010's header). Changes from the generated SQL:
--   * client_id is added nullable, filled from the owning integration, then
--     made NOT NULL (adding it NOT NULL fails on existing rows);
--   * UNIQUE (client_id, id) on google_service_accounts is created before the
--     composite FK that references it (Postgres rejects the reverse).
-- An existing row whose service account belongs to another client makes the
-- new FK fail, aborting the whole migration rather than keeping a bad link.
DO $$
BEGIN
  ALTER TABLE "google_service_accounts" ADD CONSTRAINT "google_service_accounts_client_id_id_key" UNIQUE("client_id","id");

  ALTER TABLE "google_sheets_integrations" ADD COLUMN "client_id" text;
  UPDATE "google_sheets_integrations" gs
    SET "client_id" = i."client_id"
    FROM "integrations" i
    WHERE i."id" = gs."integration_id";
  ALTER TABLE "google_sheets_integrations" ALTER COLUMN "client_id" SET NOT NULL;

  ALTER TABLE "google_sheets_integrations" DROP CONSTRAINT "google_sheets_integrations_integration_id_fkey";
  ALTER TABLE "google_sheets_integrations" DROP CONSTRAINT "google_sheets_integrations_google_service_account_id_fkey";

  ALTER TABLE "google_sheets_integrations" ADD CONSTRAINT "google_sheets_integrations_client_id_integration_id_fkey" FOREIGN KEY ("client_id","integration_id") REFERENCES "public"."integrations"("client_id","id") ON DELETE no action ON UPDATE no action;
  ALTER TABLE "google_sheets_integrations" ADD CONSTRAINT "google_sheets_integrations_client_id_gsa_id_fkey" FOREIGN KEY ("client_id","google_service_account_id") REFERENCES "public"."google_service_accounts"("client_id","id") ON DELETE no action ON UPDATE no action;
END
$$;
