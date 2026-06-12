# Historical Migrations

These files were authored and applied by `sol-notification-service` before schema ownership transferred to `sol-api`.

**Status**: Already applied to the database. Do not run these again.

| File | Description |
|------|-------------|
| V001__initial_schema.sql | Baseline — `clients` and `notification_logs` tables |
| V002__add_notification_log_columns.sql | Adds recipient, subject, resend_id, error, metadata to notification_logs |
| V003__add_google_service_account_columns.sql | Adds google_service_account_email + key to clients |
| V004__add_client_timezone.sql | Adds timezone column to clients |

All future schema changes are managed by Drizzle migrations in `db/migrations/` (one level up).
