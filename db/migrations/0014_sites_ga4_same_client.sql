-- SOL-52: a site can only use its own client's Google service account for
-- GA4, guaranteed by the database. sites.ga4_service_account_id referenced
-- google_service_accounts by id alone, the same gap 0013 closed for Google
-- Sheets integrations; this swaps it for a composite FK to the
-- UNIQUE (client_id, id) 0013 added. A NULL ga4_service_account_id is still
-- allowed (MATCH SIMPLE skips the check when any column is NULL).
--
-- drizzle-kit's output, wrapped in one DO block so it applies atomically (see
-- 0010's header). An existing site using another client's service account
-- makes the new FK fail, aborting the migration rather than keeping it.
DO $$
BEGIN
  ALTER TABLE "sites" DROP CONSTRAINT "sites_ga4_service_account_id_fkey";
  ALTER TABLE "sites" ADD CONSTRAINT "sites_client_id_ga4_service_account_id_fkey" FOREIGN KEY ("client_id","ga4_service_account_id") REFERENCES "public"."google_service_accounts"("client_id","id") ON DELETE no action ON UPDATE no action;
END
$$;
