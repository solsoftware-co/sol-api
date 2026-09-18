import type { Db } from "../lib/db.js";
import {
  listSitesFlat,
  getClientSite,
  getClientSiteWithServiceAccount,
} from "../repositories/sites.js";
import { snakeToCamelKeys } from "../lib/case.js";

export interface SiteFlatResponse {
  id: string;
  clientId: string;
  name: string;
  ga4PropertyId: string | null;
  analyticsRecipients: string[];
  analyticsReportsEnabled: boolean;
  clientTimezone: string;
}

export interface ClientSiteResponse {
  id: string;
  clientId: string;
  name: string;
  description: string | null;
  domain: string | null;
  stagingDomain: string | null;
  ga4PropertyId: string | null;
  analyticsRecipients: string[];
  analyticsReportsEnabled: boolean;
  createdAt: string;
  updatedAt: string;
  googleServiceAccount?: { email: string; key: string };
}

export class InvalidBooleanParamError extends Error {
  constructor(public readonly param: string) {
    super(`${param} must be "true" or "false"`);
    this.name = "InvalidBooleanParamError";
  }
}

function parseBooleanParam(value: string | undefined, param: string): boolean | undefined {
  if (value === undefined) return undefined;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new InvalidBooleanParamError(param);
}

export function parseSitesQuery(query: {
  active?: string;
  analyticsReportEnabled?: string;
}): { active?: boolean; analyticsReportsEnabled?: boolean } {
  return {
    active: parseBooleanParam(query.active, "active"),
    analyticsReportsEnabled: parseBooleanParam(query.analyticsReportEnabled, "analyticsReportEnabled"),
  };
}

export async function listSites(
  db: Db,
  opts: { active?: boolean; analyticsReportsEnabled?: boolean }
): Promise<SiteFlatResponse[]> {
  const rows = await listSitesFlat(db, opts);
  return rows.map((row) => snakeToCamelKeys(row));
}

export async function getSite(
  db: Db,
  clientId: string,
  siteId: string,
  includeGoogleServiceAccount: boolean
): Promise<ClientSiteResponse | null> {
  if (!includeGoogleServiceAccount) {
    const row = await getClientSite(db, clientId, siteId);
    if (!row) return null;
    return snakeToCamelKeys(row);
  }

  const row = await getClientSiteWithServiceAccount(db, clientId, siteId);
  if (!row) return null;

  const { gsa_email, gsa_key, ...base } = row;
  const response = snakeToCamelKeys(base);
  if (gsa_email && gsa_key) {
    return { ...response, googleServiceAccount: { email: gsa_email, key: gsa_key } };
  }
  return response;
}
