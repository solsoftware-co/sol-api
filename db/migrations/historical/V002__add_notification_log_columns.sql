-- V002__add_notification_log_columns.sql
-- Extends notification_logs with fields to support email auditability and
-- local reproduction. Adds recipient, subject, delivery provider ID,
-- error context, and a JSONB metadata payload of workflow inputs.
--
-- Safe to apply to existing databases — ALTER TABLE only, no data loss.
-- Existing rows will have NULL for new text columns and '{}' for metadata.

ALTER TABLE notification_logs
  ADD COLUMN recipient_email TEXT,
  ADD COLUMN subject         TEXT,
  ADD COLUMN resend_id       TEXT,
  ADD COLUMN error_message   TEXT,
  ADD COLUMN metadata        JSONB NOT NULL DEFAULT '{}';
