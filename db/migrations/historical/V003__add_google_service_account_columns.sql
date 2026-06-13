-- V003__add_google_service_account_columns.sql
-- Adds per-client Google service account credentials to the clients table.
-- These columns support two integrations:
--   1. Google Sheets sink: appending form submission rows to a client-specified sheet.
--   2. GA4 analytics: replacing the global GA4_SERVICE_ACCOUNT_JSON env var with
--      per-client credentials fetched at runtime.
--
-- Both columns are nullable so existing client records are unaffected.

ALTER TABLE clients
  ADD COLUMN google_service_account_email TEXT NULL,
  ADD COLUMN google_service_account_key   TEXT NULL;
