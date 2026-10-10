import type { Db } from "../lib/db.js";
import {
  listAnalyticsReports as listReportRows,
  listReportChannelIds,
  getClientAnalyticsReport,
  insertAnalyticsReport,
} from "../repositories/analytics-reports.js";
import { findMissingIds, InvalidReferencesError } from "../repositories/references.js";
import { sites, channels } from "../lib/schema.js";
import type { CreateAnalyticsReportInput } from "../validators/analytics-report.js";

export { ClientNotFoundError } from "../repositories/clients.js";
export { InvalidReferencesError } from "../repositories/references.js";
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

export async function getAnalyticsReport(
  db: Db,
  clientId: string,
  reportId: string
): Promise<AnalyticsReportResponse | null> {
  const row = await getClientAnalyticsReport(db, clientId, reportId);
  if (!row) return null;
  const links = await listReportChannelIds(db, [row.id]);
  return { ...snakeToCamelKeys(row), channelIds: links.map((l) => l.channel_id) };
}

// The site and channels are references only: each must be one of this
// client's, checked here so the 422 names the bad ids (unknown and
// other-client ids alike). Responds with what GET /analytics-reports/:id returns.
export async function createAnalyticsReport(
  db: Db,
  clientId: string,
  input: CreateAnalyticsReportInput
): Promise<AnalyticsReportResponse> {
  const [siteId, channelIds] = await Promise.all([
    findMissingIds(db, sites, clientId, [input.siteId]),
    findMissingIds(db, channels, clientId, input.channelIds),
  ]);
  if (siteId.length > 0 || channelIds.length > 0) {
    const details: Record<string, string[]> = {};
    if (siteId.length > 0) details.siteId = siteId;
    if (channelIds.length > 0) details.channelIds = channelIds;
    throw new InvalidReferencesError(details);
  }

  const id = await insertAnalyticsReport(db, {
    client_id: clientId,
    site_id: input.siteId,
    enabled: input.enabled,
    cron: input.cron,
    lookback: input.lookback,
    channel_ids: input.channelIds,
  });
  const report = await getAnalyticsReport(db, clientId, id);
  if (!report) throw new Error(`Analytics report ${id} not found after insert`);
  return report;
}

