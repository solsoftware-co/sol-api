-- Wave 3 (SOL-35): drops the columns 0010 moved elsewhere —
-- slack_channels.client_id/name/description (now on channels) and
-- sites.analytics_recipients/analytics_reports_enabled (now
-- analytics_reports/analytics_report_channels). One DO block, so it applies
-- atomically (see 0010's header).
DO $$
BEGIN
  ALTER TABLE "slack_channels" DROP CONSTRAINT "slack_channels_client_id_fkey";

  ALTER TABLE "sites" DROP COLUMN "analytics_recipients";

  ALTER TABLE "sites" DROP COLUMN "analytics_reports_enabled";

  ALTER TABLE "slack_channels" DROP COLUMN "client_id";

  ALTER TABLE "slack_channels" DROP COLUMN "name";

  ALTER TABLE "slack_channels" DROP COLUMN "description";
END
$$;
