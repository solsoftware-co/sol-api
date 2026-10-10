import { eq, and, inArray } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { analytics_reports, analytics_report_channels, sites, clients, channels } from "../lib/schema.js";
import type { Db } from "../lib/db.js";
import { pgErrorCode, pgErrorConstraint } from "../lib/pg-errors.js";
import { ClientNotFoundError } from "./clients.js";
import { findMissingIds, InvalidReferencesError } from "./references.js";

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

const REPORT_COLUMNS = {
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
};

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
    .select(REPORT_COLUMNS)
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

// One of this client's reports, with the same columns as the scheduler's list.
export async function getClientAnalyticsReport(
  db: Db,
  clientId: string,
  reportId: string
): Promise<AnalyticsReportRow | null> {
  const rows = await db
    .select(REPORT_COLUMNS)
    .from(analytics_reports)
    .innerJoin(sites, eq(sites.id, analytics_reports.site_id))
    .innerJoin(clients, eq(clients.id, analytics_reports.client_id))
    .where(and(eq(analytics_reports.id, reportId), eq(analytics_reports.client_id, clientId)))
    .limit(1);
  return rows[0] ?? null;
}

export interface NewAnalyticsReport {
  client_id: string;
  site_id: string;
  enabled: boolean;
  cron: string;
  lookback: string;
  channel_ids: string[];
}

// The report and the channels it's sent to in one db.batch (one
// transaction). If the site or a channel stopped being this client's after
// the service's check, the same-client FK fails and the 422 is recomputed so
// it matches the one the check gives.
export async function insertAnalyticsReport(db: Db, data: NewAnalyticsReport): Promise<string> {
  const id = crypto.randomUUID();
  const statements: BatchItem<"pg">[] = [
    db.insert(analytics_reports).values({
      id,
      client_id: data.client_id,
      site_id: data.site_id,
      enabled: data.enabled,
      cron: data.cron,
      lookback: data.lookback,
    }),
  ];
  if (data.channel_ids.length > 0) {
    statements.push(
      db.insert(analytics_report_channels).values(
        data.channel_ids.map((channel_id) => ({ analytics_report_id: id, channel_id, client_id: data.client_id }))
      )
    );
  }

  try {
    await db.batch(statements as [BatchItem<"pg">, ...BatchItem<"pg">[]]);
    return id;
  } catch (err: unknown) {
    if (pgErrorCode(err) === "23503") {
      const constraint = pgErrorConstraint(err);
      if (constraint === "analytics_reports_client_id_fkey") throw new ClientNotFoundError(data.client_id);
      if (
        constraint === "analytics_reports_client_id_site_id_fkey" ||
        constraint === "analytics_report_channels_client_id_channel_id_fkey"
      ) {
        const [siteId, channelIds] = await Promise.all([
          findMissingIds(db, sites, data.client_id, [data.site_id]),
          findMissingIds(db, channels, data.client_id, data.channel_ids),
        ]);
        const details: Record<string, string[]> = {};
        if (siteId.length > 0) details.siteId = siteId;
        if (channelIds.length > 0) details.channelIds = channelIds;
        if (Object.keys(details).length > 0) throw new InvalidReferencesError(details);
      }
    }
    throw err;
  }
}

