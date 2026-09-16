// Frozen fork of the client data-access layer that sol-notificaiton-service's
// old (Inngest) workflows were built against. Nothing here imports from
// repositories/ or services/, and nothing outside legacy/ imports from this
// file — see clients.route.ts for the full rationale. Moved as-is from
// lib/db.ts (SOL-7 restructure); behavior is unchanged.
import { eq, and, inArray, sql } from "drizzle-orm";
import {
  clients,
  google_service_accounts,
  slack_channels,
  sites,
  sanity_configs,
  github_repos,
} from "../lib/schema.js";
import type { Db } from "../lib/db.js";
import { pgErrorCode } from "../lib/pg-errors.js";
import type { ClientRecord, ClientSummary, ClientWithCredentials } from "../types/index.js";

export class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConflictError";
  }
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

async function getGoogleServiceAccount(
  db: Db,
  clientId: string
): Promise<{ email: string; key: string } | null> {
  const rows = await db
    .select({ email: google_service_accounts.email, key: google_service_accounts.key })
    .from(google_service_accounts)
    .where(eq(google_service_accounts.client_id, clientId))
    .orderBy(google_service_accounts.created_at)
    .limit(1);
  return rows[0] ?? null;
}

async function getSlackChannel(db: Db, clientId: string): Promise<{ webhook_url: string } | null> {
  const rows = await db
    .select({ webhook_url: slack_channels.webhook_url })
    .from(slack_channels)
    .where(eq(slack_channels.client_id, clientId))
    .orderBy(slack_channels.created_at)
    .limit(1);
  return rows[0] ?? null;
}

async function getSite(db: Db, clientId: string): Promise<{ id: string; ga4_property_id: string | null } | null> {
  const rows = await db
    .select({ id: sites.id, ga4_property_id: sites.ga4_property_id })
    .from(sites)
    .where(eq(sites.client_id, clientId))
    .orderBy(sites.created_at)
    .limit(1);
  return rows[0] ?? null;
}

async function getSanityConfig(
  db: Db,
  siteId: string
): Promise<{ project_id: string; prod_dataset: string; staging_dataset: string } | null> {
  const rows = await db
    .select({
      project_id: sanity_configs.project_id,
      prod_dataset: sanity_configs.prod_dataset,
      staging_dataset: sanity_configs.staging_dataset,
    })
    .from(sanity_configs)
    .where(eq(sanity_configs.site_id, siteId))
    .limit(1);
  return rows[0] ?? null;
}

async function getGithubRepo(
  db: Db,
  siteId: string
): Promise<{ repo_url: string; default_branch: string; staging_branch: string | null } | null> {
  const rows = await db
    .select({
      repo_url: github_repos.repo_url,
      default_branch: github_repos.default_branch,
      staging_branch: github_repos.staging_branch,
    })
    .from(github_repos)
    .where(eq(github_repos.site_id, siteId))
    .limit(1);
  return rows[0] ?? null;
}

async function fetchClientRecord(
  db: Db,
  id: string,
  opts: { requireActive: boolean }
): Promise<ClientRecord | null> {
  const rows = await db
    .select()
    .from(clients)
    .where(opts.requireActive ? and(eq(clients.id, id), eq(clients.active, true)) : eq(clients.id, id))
    .limit(1);

  const client = rows[0];
  if (!client) return null;

  const [googleAccount, channel, site] = await Promise.all([
    getGoogleServiceAccount(db, id),
    getSlackChannel(db, id),
    getSite(db, id),
  ]);

  const [sanityConfig, githubRepo] = site
    ? await Promise.all([getSanityConfig(db, site.id), getGithubRepo(db, site.id)])
    : [null, null];

  return {
    ...client,
    google_service_account_email: googleAccount?.email ?? null,
    google_service_account_key: googleAccount?.key ?? null,
    slack_webhook_url: channel?.webhook_url ?? null,
    ga4_property_id: site?.ga4_property_id ?? null,
    sanity_project_id: sanityConfig?.project_id ?? null,
    sanity_production_dataset: sanityConfig?.prod_dataset ?? null,
    sanity_staging_dataset: sanityConfig?.staging_dataset ?? null,
    github_repo: githubRepo?.repo_url ?? null,
    github_default_branch: githubRepo?.default_branch ?? "main",
    github_test_branch: githubRepo?.staging_branch ?? null,
  } as ClientRecord;
}

export async function getClientById(
  db: Db,
  id: string,
  opts: { includeGoogleCredentials?: boolean; includeSlackCredentials?: boolean } = {}
): Promise<ClientWithCredentials | null> {
  const record = await fetchClientRecord(db, id, { requireActive: true });
  if (!record) return null;

  const { google_service_account_key, slack_webhook_url, ...summary } = record;
  return {
    ...summary,
    ...(opts.includeGoogleCredentials ? { google_service_account_key } : {}),
    ...(opts.includeSlackCredentials ? { slack_webhook_url } : {}),
  } as ClientWithCredentials;
}

export async function listClients(
  db: Db,
  opts: { limit?: number } = {}
): Promise<ClientSummary[]> {
  const query = db
    .select()
    .from(clients)
    .where(eq(clients.active, true));

  const rows = opts.limit !== undefined ? await query.limit(opts.limit) : await query;
  if (rows.length === 0) return [];

  // google_service_account_email isn't a secret and stays on the summary
  // shape (unlike the key) — fetched in one bulk query rather than N+1.
  const clientIds = rows.map((r) => r.id as string);
  const accounts = await db
    .select({
      client_id: google_service_accounts.client_id,
      email: google_service_accounts.email,
      created_at: google_service_accounts.created_at,
    })
    .from(google_service_accounts)
    .where(inArray(google_service_accounts.client_id, clientIds));

  const emailByClient = new Map<string, string>();
  for (const acct of [...accounts].sort((a, b) => a.created_at.localeCompare(b.created_at))) {
    if (!emailByClient.has(acct.client_id)) emailByClient.set(acct.client_id, acct.email);
  }

  const siteRows = await db
    .select({
      client_id: sites.client_id,
      id: sites.id,
      ga4_property_id: sites.ga4_property_id,
      created_at: sites.created_at,
    })
    .from(sites)
    .where(inArray(sites.client_id, clientIds));

  const siteByClient = new Map<string, { id: string; ga4_property_id: string | null }>();
  for (const s of [...siteRows].sort((a, b) => a.created_at.localeCompare(b.created_at))) {
    if (!siteByClient.has(s.client_id)) siteByClient.set(s.client_id, { id: s.id, ga4_property_id: s.ga4_property_id });
  }
  const siteIds = [...siteByClient.values()].map((s) => s.id);

  const sanityRows =
    siteIds.length > 0
      ? await db
          .select({
            site_id: sanity_configs.site_id,
            project_id: sanity_configs.project_id,
            prod_dataset: sanity_configs.prod_dataset,
            staging_dataset: sanity_configs.staging_dataset,
          })
          .from(sanity_configs)
          .where(inArray(sanity_configs.site_id, siteIds))
      : [];
  const sanityBySite = new Map(sanityRows.map((r) => [r.site_id, r]));

  const githubRows =
    siteIds.length > 0
      ? await db
          .select({
            site_id: github_repos.site_id,
            repo_url: github_repos.repo_url,
            default_branch: github_repos.default_branch,
            staging_branch: github_repos.staging_branch,
          })
          .from(github_repos)
          .where(inArray(github_repos.site_id, siteIds))
      : [];
  const githubBySite = new Map(githubRows.map((r) => [r.site_id, r]));

  return rows.map((row) => {
    const site = siteByClient.get(row.id as string);
    const sanityConfig = site ? sanityBySite.get(site.id) : undefined;
    const githubRepo = site ? githubBySite.get(site.id) : undefined;
    return {
      ...row,
      google_service_account_email: emailByClient.get(row.id as string) ?? null,
      ga4_property_id: site?.ga4_property_id ?? null,
      sanity_project_id: sanityConfig?.project_id ?? null,
      sanity_production_dataset: sanityConfig?.prod_dataset ?? null,
      sanity_staging_dataset: sanityConfig?.staging_dataset ?? null,
      github_repo: githubRepo?.repo_url ?? null,
      github_default_branch: githubRepo?.default_branch ?? "main",
      github_test_branch: githubRepo?.staging_branch ?? null,
    };
  }) as ClientSummary[];
}

export async function insertClient(
  db: Db,
  data: {
    id: string;
    name: string;
    email: string;
    ga4_property_id?: string | null;
    timezone?: string;
    settings?: Record<string, unknown>;
    google_service_account_email?: string | null;
    google_service_account_key?: string | null;
    sanity_project_id?: string | null;
    sanity_production_dataset?: string | null;
    sanity_staging_dataset?: string | null;
    github_repo?: string | null;
    github_default_branch?: string | null;
    github_test_branch?: string | null;
    slack_webhook_url?: string | null;
  }
): Promise<ClientRecord> {
  try {
    const rows = await db
      .insert(clients)
      .values({
        id: data.id,
        name: data.name,
        email: data.email,
        timezone: data.timezone ?? "America/Chicago",
        settings: data.settings ?? {},
      })
      .returning();
    const client = rows[0];

    let googleEmail: string | null = null;
    let googleKey: string | null = null;
    if (data.google_service_account_email && data.google_service_account_key) {
      await db.insert(google_service_accounts).values({
        client_id: data.id,
        email: data.google_service_account_email,
        key: data.google_service_account_key,
      });
      googleEmail = data.google_service_account_email;
      googleKey = data.google_service_account_key;
    }

    let slackWebhookUrl: string | null = null;
    if (data.slack_webhook_url) {
      await db.insert(slack_channels).values({
        client_id: data.id,
        name: "Default",
        webhook_url: data.slack_webhook_url,
      });
      slackWebhookUrl = data.slack_webhook_url;
    }

    const ga4PropertyId = data.ga4_property_id ?? null;
    const siteRows = await db
      .insert(sites)
      .values({ client_id: data.id, name: data.name, ga4_property_id: ga4PropertyId })
      .returning({ id: sites.id });
    const siteId = siteRows[0].id;

    let sanityProjectId: string | null = null;
    let sanityProdDataset: string | null = null;
    let sanityStagingDataset: string | null = null;
    if (data.sanity_project_id) {
      await db.insert(sanity_configs).values({
        site_id: siteId,
        project_id: data.sanity_project_id,
        prod_dataset: data.sanity_production_dataset!,
        staging_dataset: data.sanity_staging_dataset!,
      });
      sanityProjectId = data.sanity_project_id;
      sanityProdDataset = data.sanity_production_dataset!;
      sanityStagingDataset = data.sanity_staging_dataset!;
    }

    let githubRepoUrl: string | null = null;
    let githubDefaultBranch: string | null = null;
    let githubTestBranch: string | null = null;
    if (data.github_repo) {
      githubDefaultBranch = data.github_default_branch ?? "main";
      githubTestBranch = data.github_test_branch ?? null;
      await db.insert(github_repos).values({
        site_id: siteId,
        repo_url: data.github_repo,
        default_branch: githubDefaultBranch,
        staging_branch: githubTestBranch,
      });
      githubRepoUrl = data.github_repo;
    } else {
      githubDefaultBranch = "main";
    }

    return {
      ...client,
      google_service_account_email: googleEmail,
      google_service_account_key: googleKey,
      slack_webhook_url: slackWebhookUrl,
      ga4_property_id: ga4PropertyId,
      sanity_project_id: sanityProjectId,
      sanity_production_dataset: sanityProdDataset,
      sanity_staging_dataset: sanityStagingDataset,
      github_repo: githubRepoUrl,
      github_default_branch: githubDefaultBranch,
      github_test_branch: githubTestBranch,
    } as ClientRecord;
  } catch (err: unknown) {
    if (pgErrorCode(err) === "23505") {
      throw new ConflictError(`Client already exists: ${data.id}`);
    }
    throw err;
  }
}

const UPDATABLE_COLUMNS = new Set(["name", "email", "active", "timezone", "settings"]);

async function applyGoogleServiceAccountUpdate(
  db: Db,
  clientId: string,
  data: Record<string, unknown>
): Promise<void> {
  const emailProvided = "google_service_account_email" in data && data.google_service_account_email !== undefined;
  const keyProvided = "google_service_account_key" in data && data.google_service_account_key !== undefined;
  if (!emailProvided && !keyProvided) return;

  const existing = await getGoogleServiceAccount(db, clientId);
  const mergedEmail = (emailProvided ? data.google_service_account_email : existing?.email) as string | null;
  const mergedKey = (keyProvided ? data.google_service_account_key : existing?.key) as string | null;

  if (mergedEmail && mergedKey) {
    if (existing) {
      await db
        .update(google_service_accounts)
        .set({ email: mergedEmail, key: mergedKey, updated_at: sql`now()` })
        .where(eq(google_service_accounts.client_id, clientId));
    } else {
      await db.insert(google_service_accounts).values({ client_id: clientId, email: mergedEmail, key: mergedKey });
    }
  } else if (!mergedEmail && !mergedKey) {
    if (existing) {
      await db.delete(google_service_accounts).where(eq(google_service_accounts.client_id, clientId));
    }
  } else {
    throw new ValidationError(
      "google_service_account_email and google_service_account_key must be provided together"
    );
  }
}

async function applySlackChannelUpdate(db: Db, clientId: string, data: Record<string, unknown>): Promise<void> {
  if (!("slack_webhook_url" in data) || data.slack_webhook_url === undefined) return;

  const webhookUrl = data.slack_webhook_url as string | null;
  const existing = await getSlackChannel(db, clientId);

  if (webhookUrl) {
    if (existing) {
      await db
        .update(slack_channels)
        .set({ webhook_url: webhookUrl, updated_at: sql`now()` })
        .where(eq(slack_channels.client_id, clientId));
    } else {
      await db.insert(slack_channels).values({ client_id: clientId, name: "Default", webhook_url: webhookUrl });
    }
  } else if (existing) {
    await db.delete(slack_channels).where(eq(slack_channels.client_id, clientId));
  }
}

async function applySiteGa4Update(db: Db, siteId: string, data: Record<string, unknown>): Promise<void> {
  if (!("ga4_property_id" in data)) return;
  await db
    .update(sites)
    .set({ ga4_property_id: data.ga4_property_id as string | null, updated_at: sql`now()` })
    .where(eq(sites.id, siteId));
}

async function applySanityConfigUpdate(db: Db, siteId: string, data: Record<string, unknown>): Promise<void> {
  const projectProvided = "sanity_project_id" in data && data.sanity_project_id !== undefined;
  const prodProvided = "sanity_production_dataset" in data && data.sanity_production_dataset !== undefined;
  const stagingProvided = "sanity_staging_dataset" in data && data.sanity_staging_dataset !== undefined;
  if (!projectProvided && !prodProvided && !stagingProvided) return;

  const existing = await getSanityConfig(db, siteId);
  const mergedProject = (projectProvided ? data.sanity_project_id : existing?.project_id) as string | null;
  const mergedProd = (prodProvided ? data.sanity_production_dataset : existing?.prod_dataset) as string | null;
  const mergedStaging = (stagingProvided ? data.sanity_staging_dataset : existing?.staging_dataset) as string | null;

  if (mergedProject && mergedProd && mergedStaging) {
    if (existing) {
      await db
        .update(sanity_configs)
        .set({ project_id: mergedProject, prod_dataset: mergedProd, staging_dataset: mergedStaging })
        .where(eq(sanity_configs.site_id, siteId));
    } else {
      await db
        .insert(sanity_configs)
        .values({ site_id: siteId, project_id: mergedProject, prod_dataset: mergedProd, staging_dataset: mergedStaging });
    }
  } else if (!mergedProject && !mergedProd && !mergedStaging) {
    if (existing) {
      await db.delete(sanity_configs).where(eq(sanity_configs.site_id, siteId));
    }
  } else {
    throw new ValidationError(
      "sanity_project_id, sanity_production_dataset, and sanity_staging_dataset must be provided together"
    );
  }
}

async function applyGithubRepoUpdate(db: Db, siteId: string, data: Record<string, unknown>): Promise<void> {
  if (!("github_repo" in data) || data.github_repo === undefined) return;

  const repoUrl = data.github_repo as string | null;
  const existing = await getGithubRepo(db, siteId);

  if (repoUrl) {
    const defaultBranchProvided = "github_default_branch" in data && data.github_default_branch !== undefined;
    const testBranchProvided = "github_test_branch" in data && data.github_test_branch !== undefined;
    const defaultBranch = (defaultBranchProvided ? data.github_default_branch : existing?.default_branch ?? "main") as string;
    const testBranch = (testBranchProvided ? data.github_test_branch : existing?.staging_branch ?? null) as string | null;

    if (existing) {
      await db
        .update(github_repos)
        .set({ repo_url: repoUrl, default_branch: defaultBranch, staging_branch: testBranch })
        .where(eq(github_repos.site_id, siteId));
    } else {
      await db
        .insert(github_repos)
        .values({ site_id: siteId, repo_url: repoUrl, default_branch: defaultBranch, staging_branch: testBranch });
    }
  } else if (existing) {
    await db.delete(github_repos).where(eq(github_repos.site_id, siteId));
  }
}

export async function updateClient(
  db: Db,
  id: string,
  data: Record<string, unknown>
): Promise<ClientRecord | null> {
  const columnUpdates = Object.fromEntries(
    Object.entries(data).filter(
      ([key, val]) => UPDATABLE_COLUMNS.has(key) && val !== undefined
    )
  );

  const touchesGoogle = "google_service_account_email" in data || "google_service_account_key" in data;
  const touchesSlack = "slack_webhook_url" in data;
  const touchesGa4 = "ga4_property_id" in data;
  const touchesSanity =
    "sanity_project_id" in data || "sanity_production_dataset" in data || "sanity_staging_dataset" in data;
  const touchesGithub =
    "github_repo" in data || "github_default_branch" in data || "github_test_branch" in data;

  if (
    Object.keys(columnUpdates).length === 0 &&
    !touchesGoogle &&
    !touchesSlack &&
    !touchesGa4 &&
    !touchesSanity &&
    !touchesGithub
  ) {
    return null;
  }

  const existingClient = await db
    .select({ id: clients.id })
    .from(clients)
    .where(eq(clients.id, id))
    .limit(1);
  if (existingClient.length === 0) return null;

  if (Object.keys(columnUpdates).length > 0) {
    await db.update(clients).set(columnUpdates).where(eq(clients.id, id));
  }

  if (touchesGoogle) {
    await applyGoogleServiceAccountUpdate(db, id, data);
  }
  if (touchesSlack) {
    await applySlackChannelUpdate(db, id, data);
  }

  if (touchesGa4 || touchesSanity || touchesGithub) {
    const site = await getSite(db, id);
    if (site) {
      if (touchesGa4) await applySiteGa4Update(db, site.id, data);
      if (touchesSanity) await applySanityConfigUpdate(db, site.id, data);
      if (touchesGithub) await applyGithubRepoUpdate(db, site.id, data);
    }
  }

  return fetchClientRecord(db, id, { requireActive: false });
}
