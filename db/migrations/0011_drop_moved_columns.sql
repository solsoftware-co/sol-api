-- Wave 3 (SOL-35): drops the columns 0010 moved elsewhere —
-- slack_channels.client_id/name/description (now on channels) and
-- sites.analytics_recipients/analytics_reports_enabled (now
-- analytics_reports/analytics_report_channels). One DO block, so it applies
-- atomically (see 0010's header).
DO $$
BEGIN

END
$$;
