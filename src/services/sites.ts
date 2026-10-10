import type { Db } from "../lib/db.js";
import {
  listSitesFlat,
  getClientSite,
  getClientSiteWithServiceAccount,
  insertSite,
  type ClientSiteRow,
} from "../repositories/sites.js";
import { findMissingIds, InvalidReferencesError } from "../repositories/references.js";
import { google_service_accounts } from "../lib/schema.js";
import { snakeToCamelKeys } from "../lib/case.js";
import type { CreateSiteInput } from "../validators/site.js";

export { ClientNotFoundError } from "../repositories/clients.js";
export { InvalidReferencesError } from "../repositories/references.js";

export interface SiteFlatResponse {
  id: string;
  clientId: string;
  name: string;
  ga4PropertyId: string | null;
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
  /** Which service account reads GA4 for this site; its key stays behind ?include=googleServiceAccount. */
  ga4ServiceAccountId: string | null;
  createdAt: string;
  updatedAt: string;
  sanityConfig: { projectId: string; prodDataset: string; stagingDataset: string } | null;
  githubRepo: { repoUrl: string; defaultBranch: string; stagingBranch: string | null } | null;
  googleServiceAccount?: { email: string; key: string };
}

function toClientSiteResponse(row: ClientSiteRow): ClientSiteResponse {
  const {
    sanity_project_id,
    sanity_prod_dataset,
    sanity_staging_dataset,
    github_repo_url,
    github_default_branch,
    github_staging_branch,
    ...site
  } = row;
  return {
    ...snakeToCamelKeys(site),
    sanityConfig:
      sanity_project_id !== null
        ? { projectId: sanity_project_id, prodDataset: sanity_prod_dataset!, stagingDataset: sanity_staging_dataset! }
        : null,
    githubRepo:
      github_repo_url !== null
        ? { repoUrl: github_repo_url, defaultBranch: github_default_branch!, stagingBranch: github_staging_branch }
        : null,
  };
}

import { parseBooleanParam } from "../lib/query-params.js";

export { InvalidBooleanParamError } from "../lib/query-params.js";

// analyticsReportEnabled was removed with the sites.analytics_* columns
// (SOL-35) — which reports exist and are due now lives on analytics_reports.
export function parseSitesQuery(query: { active?: string }): { active?: boolean } {
  return {
    active: parseBooleanParam(query.active, "active"),
  };
}

export async function listSites(
  db: Db,
  opts: { active?: boolean }
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
    return toClientSiteResponse(row);
  }

  const row = await getClientSiteWithServiceAccount(db, clientId, siteId);
  if (!row) return null;

  const { gsa_email, gsa_key, ...base } = row;
  const response = toClientSiteResponse(base);
  if (gsa_email && gsa_key) {
    return { ...response, googleServiceAccount: { email: gsa_email, key: gsa_key } };
  }
  return response;
}

// ga4ServiceAccountId must be one of this client's service accounts: checked
// first so the 422 names it (migration 0014's same-client FK backs this up).
// Responds with what GET /sites/:id returns, without the service account key.
export async function createSite(db: Db, clientId: string, input: CreateSiteInput): Promise<ClientSiteResponse> {
  if (input.ga4ServiceAccountId) {
    const missing = await findMissingIds(db, google_service_accounts, clientId, [input.ga4ServiceAccountId]);
    if (missing.length > 0) throw new InvalidReferencesError({ ga4ServiceAccountId: missing });
  }

  const id = await insertSite(db, {
    client_id: clientId,
    name: input.name,
    description: input.description ?? null,
    domain: input.domain ?? null,
    staging_domain: input.stagingDomain ?? null,
    ga4_property_id: input.ga4PropertyId ?? null,
    ga4_service_account_id: input.ga4ServiceAccountId ?? null,
    sanity_config: input.sanityConfig
      ? {
          project_id: input.sanityConfig.projectId,
          prod_dataset: input.sanityConfig.prodDataset,
          staging_dataset: input.sanityConfig.stagingDataset,
        }
      : null,
    github_repo: input.githubRepo
      ? {
          repo_url: input.githubRepo.repoUrl,
          default_branch: input.githubRepo.defaultBranch,
          staging_branch: input.githubRepo.stagingBranch ?? null,
        }
      : null,
  });

  const site = await getSite(db, clientId, id, false);
  if (!site) throw new Error(`Site ${id} not found after insert`);
  return site;
}

