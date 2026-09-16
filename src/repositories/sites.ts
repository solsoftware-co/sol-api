import { eq, and } from "drizzle-orm";
import { sites, clients, google_service_accounts } from "../lib/schema.js";
import type { Db } from "../lib/db.js";

export interface SiteFlatRow {
  id: string;
  client_id: string;
  name: string;
  ga4_property_id: string | null;
  analytics_recipients: string[];
  analytics_reports_enabled: boolean;
  client_timezone: string;
}

// The select() column list below is the entire security boundary for this
// route: ga4_service_account_id is never selected and google_service_accounts
// is never joined, so there is no way for a secret to end up in a fleet-wide
// response regardless of query params — there is deliberately no ?include=
// escape hatch here.
export async function listSitesFlat(
  db: Db,
  opts: { active?: boolean; analyticsReportsEnabled?: boolean } = {}
): Promise<SiteFlatRow[]> {
  const conditions = [
    opts.active !== undefined ? eq(clients.active, opts.active) : undefined,
    opts.analyticsReportsEnabled !== undefined
      ? eq(sites.analytics_reports_enabled, opts.analyticsReportsEnabled)
      : undefined,
  ].filter((c): c is NonNullable<typeof c> => c !== undefined);

  return db
    .select({
      id: sites.id,
      client_id: sites.client_id,
      name: sites.name,
      ga4_property_id: sites.ga4_property_id,
      analytics_recipients: sites.analytics_recipients,
      analytics_reports_enabled: sites.analytics_reports_enabled,
      client_timezone: clients.timezone,
    })
    .from(sites)
    .innerJoin(clients, eq(sites.client_id, clients.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined);
}

export interface ClientSiteRow {
  id: string;
  client_id: string;
  name: string;
  description: string | null;
  domain: string | null;
  staging_domain: string | null;
  ga4_property_id: string | null;
  analytics_recipients: string[];
  analytics_reports_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface ClientSiteWithServiceAccountRow extends ClientSiteRow {
  gsa_email: string | null;
  gsa_key: string | null;
}

const SITE_COLUMNS = {
  id: sites.id,
  client_id: sites.client_id,
  name: sites.name,
  description: sites.description,
  domain: sites.domain,
  staging_domain: sites.staging_domain,
  ga4_property_id: sites.ga4_property_id,
  analytics_recipients: sites.analytics_recipients,
  analytics_reports_enabled: sites.analytics_reports_enabled,
  created_at: sites.created_at,
  updated_at: sites.updated_at,
};

// Two separate query methods — not one query with a conditional join — so the
// join-level gating is real: when the caller doesn't ask for the service
// account, the SQL that actually runs never references google_service_accounts
// at all, rather than fetching it and stripping it in application code.
export async function getClientSite(db: Db, clientId: string, siteId: string): Promise<ClientSiteRow | null> {
  const rows = await db
    .select(SITE_COLUMNS)
    .from(sites)
    .where(and(eq(sites.id, siteId), eq(sites.client_id, clientId)))
    .limit(1);
  return rows[0] ?? null;
}

export async function getClientSiteWithServiceAccount(
  db: Db,
  clientId: string,
  siteId: string
): Promise<ClientSiteWithServiceAccountRow | null> {
  const rows = await db
    .select({
      ...SITE_COLUMNS,
      gsa_email: google_service_accounts.email,
      gsa_key: google_service_accounts.key,
    })
    .from(sites)
    .leftJoin(google_service_accounts, eq(sites.ga4_service_account_id, google_service_accounts.id))
    .where(and(eq(sites.id, siteId), eq(sites.client_id, clientId)))
    .limit(1);
  return rows[0] ?? null;
}
