import { eq, and, inArray } from "drizzle-orm";
import { analytics_reports, analytics_report_channels, sites, clients } from "../lib/schema.js";
import type { Db } from "../lib/db.js";

export interface AnalyticsReportRow {
  id: string;
  client_id: string;
  site_id: string;
  site_name: string;
  ga4_property_id: string | null;
  client_timezone: string;
  enabled: boolean;
  cron: string;
  lookback: string;
  last_run_at: string | null;
}

// Flat, cross-tenant — for the analytics scheduler only, like /v1/sites. The
// column list is the security boundary: sites.ga4_service_account_id is never
// selected and google_service_accounts is never joined (GA4 credentials stay
// behind GET /v1/clients/:clientId/sites/:siteId?include=googleServiceAccount).
export async function listAnalyticsReports(
  db: Db,
  opts: { enabled?: boolean; active?: boolean } = {}
): Promise<AnalyticsReportRow[]> {
  const conditions = [
    opts.enabled !== undefined ? eq(analytics_reports.enabled, opts.enabled) : undefined,
    opts.active !== undefined ? eq(clients.active, opts.active) : undefined,
  ].filter((c): c is NonNullable<typeof c> => c !== undefined);

  return db
    .select({
      id: analytics_reports.id,
      client_id: analytics_reports.client_id,
      site_id: analytics_reports.site_id,
      site_name: sites.name,
      ga4_property_id: sites.ga4_property_id,
      client_timezone: clients.timezone,
      enabled: analytics_reports.enabled,
      cron: analytics_reports.cron,
      lookback: analytics_reports.lookback,
      last_run_at: analytics_reports.last_run_at,
    })
    .from(analytics_reports)
    .innerJoin(sites, eq(sites.id, analytics_reports.site_id))
    .innerJoin(clients, eq(clients.id, analytics_reports.client_id))
    .where(conditions.length > 0 ? and(...conditions) : undefined);
}

export async function listReportChannelIds(
  db: Db,
  reportIds: string[]
): Promise<{ analytics_report_id: string; channel_id: string }[]> {
  if (reportIds.length === 0) return [];
  return db
    .select({
      analytics_report_id: analytics_report_channels.analytics_report_id,
      channel_id: analytics_report_channels.channel_id,
    })
    .from(analytics_report_channels)
    .where(inArray(analytics_report_channels.analytics_report_id, reportIds));
}
