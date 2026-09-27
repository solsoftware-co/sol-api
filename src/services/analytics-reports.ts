import type { Db } from "../lib/db.js";
import { listAnalyticsReports as listReportRows, listReportChannelIds } from "../repositories/analytics-reports.js";
import { parseBooleanParam } from "../lib/query-params.js";
import { snakeToCamelKeys } from "../lib/case.js";

export interface AnalyticsReportResponse {
  id: string;
  clientId: string;
  siteId: string;
  siteName: string;
  ga4PropertyId: string | null;
  clientTimezone: string;
  enabled: boolean;
  cron: string;
  lookback: string;
  lastRunAt: string | null;
  channelIds: string[];
}

export function parseAnalyticsReportsQuery(query: { enabled?: string; active?: string }): {
  enabled?: boolean;
  active?: boolean;
} {
  return {
    enabled: parseBooleanParam(query.enabled, "enabled"),
    active: parseBooleanParam(query.active, "active"),
  };
}

export async function listAnalyticsReports(
  db: Db,
  opts: { enabled?: boolean; active?: boolean }
): Promise<AnalyticsReportResponse[]> {
  const rows = await listReportRows(db, opts);
  const links = await listReportChannelIds(db, rows.map((r) => r.id));
  return rows.map((row) => ({
    ...snakeToCamelKeys(row),
    channelIds: links.filter((l) => l.analytics_report_id === row.id).map((l) => l.channel_id),
  }));
}
