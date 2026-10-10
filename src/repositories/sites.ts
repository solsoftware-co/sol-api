import { eq, and } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { sites, clients, google_service_accounts, sanity_configs, github_repos } from "../lib/schema.js";
import type { Db } from "../lib/db.js";
import { pgErrorCode, pgErrorConstraint } from "../lib/pg-errors.js";
import { ClientNotFoundError } from "./clients.js";
import { InvalidReferencesError } from "./references.js";

export interface SiteFlatRow {
  id: string;
  client_id: string;
  name: string;
  ga4_property_id: string | null;
  client_timezone: string;
}

// The select() column list below is the entire security boundary for this
// route: ga4_service_account_id is never selected and google_service_accounts
// is never joined, so there is no way for a secret to end up in a fleet-wide
// response regardless of query params — there is deliberately no ?include=
// escape hatch here.
export async function listSitesFlat(
  db: Db,
  opts: { active?: boolean } = {}
): Promise<SiteFlatRow[]> {
  const conditions = [
    opts.active !== undefined ? eq(clients.active, opts.active) : undefined,
  ].filter((c): c is NonNullable<typeof c> => c !== undefined);

  return db
    .select({
      id: sites.id,
      client_id: sites.client_id,
      name: sites.name,
      ga4_property_id: sites.ga4_property_id,
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
  ga4_service_account_id: string | null;
  created_at: string;
  updated_at: string;
  // The 1:1 halves, left-joined: null when the site has none.
  sanity_project_id: string | null;
  sanity_prod_dataset: string | null;
  sanity_staging_dataset: string | null;
  github_repo_url: string | null;
  github_default_branch: string | null;
  github_staging_branch: string | null;
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
  ga4_service_account_id: sites.ga4_service_account_id,
  created_at: sites.created_at,
  updated_at: sites.updated_at,
  sanity_project_id: sanity_configs.project_id,
  sanity_prod_dataset: sanity_configs.prod_dataset,
  sanity_staging_dataset: sanity_configs.staging_dataset,
  github_repo_url: github_repos.repo_url,
  github_default_branch: github_repos.default_branch,
  github_staging_branch: github_repos.staging_branch,
};

// Two separate query methods — not one query with a conditional join — so the
// join-level gating is real: when the caller doesn't ask for the service
// account, the SQL that actually runs never references google_service_accounts
// at all, rather than fetching it and stripping it in application code.
export async function getClientSite(db: Db, clientId: string, siteId: string): Promise<ClientSiteRow | null> {
  const rows = await db
    .select(SITE_COLUMNS)
    .from(sites)
    .leftJoin(sanity_configs, eq(sanity_configs.site_id, sites.id))
    .leftJoin(github_repos, eq(github_repos.site_id, sites.id))
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
    .leftJoin(sanity_configs, eq(sanity_configs.site_id, sites.id))
    .leftJoin(github_repos, eq(github_repos.site_id, sites.id))
    .leftJoin(google_service_accounts, eq(sites.ga4_service_account_id, google_service_accounts.id))
    .where(and(eq(sites.id, siteId), eq(sites.client_id, clientId)))
    .limit(1);
  return rows[0] ?? null;
}

export interface NewSite {
  client_id: string;
  name: string;
  description: string | null;
  domain: string | null;
  staging_domain: string | null;
  ga4_property_id: string | null;
  ga4_service_account_id: string | null;
  sanity_config: { project_id: string; prod_dataset: string; staging_dataset: string } | null;
  github_repo: { repo_url: string; default_branch?: string; staging_branch: string | null } | null;
}

// The site and its Sanity/GitHub halves in one db.batch (one transaction),
// with the id generated here so every insert is known up front. Two FKs can
// fail: the client (→ 404) or the same-client service account FK from 0014,
// if the account changed after the service's check (→ the same 422).
export async function insertSite(db: Db, data: NewSite): Promise<string> {
  const id = crypto.randomUUID();
  const statements: BatchItem<"pg">[] = [
    db.insert(sites).values({
      id,
      client_id: data.client_id,
      name: data.name,
      description: data.description,
      domain: data.domain,
      staging_domain: data.staging_domain,
      ga4_property_id: data.ga4_property_id,
      ga4_service_account_id: data.ga4_service_account_id,
    }),
  ];
  if (data.sanity_config) statements.push(db.insert(sanity_configs).values({ site_id: id, ...data.sanity_config }));
  if (data.github_repo) {
    const { default_branch, ...repo } = data.github_repo;
    statements.push(
      db.insert(github_repos).values({ site_id: id, ...repo, ...(default_branch !== undefined && { default_branch }) })
    );
  }

  try {
    await db.batch(statements as [BatchItem<"pg">, ...BatchItem<"pg">[]]);
    return id;
  } catch (err: unknown) {
    if (pgErrorCode(err) === "23503") {
      if (pgErrorConstraint(err) === "sites_client_id_ga4_service_account_id_fkey" && data.ga4_service_account_id) {
        throw new InvalidReferencesError({ ga4ServiceAccountId: [data.ga4_service_account_id] });
      }
      if (pgErrorConstraint(err) === "sites_client_id_fkey") throw new ClientNotFoundError(data.client_id);
    }
    throw err;
  }
}

