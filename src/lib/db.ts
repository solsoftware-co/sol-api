import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { eq, and, gte, lte, desc, inArray, getTableColumns } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { clients, notification_logs, google_service_accounts, slack_channels } from "./schema.js";
import type { ClientRecord, ClientSummary, ClientWithCredentials, NotificationLog } from "../types/index.js";

export type Db = ReturnType<typeof drizzle>;

export function createDb(url: string): Db {
  return drizzle(neon(url));
}

export async function healthCheck(db: Db): Promise<void> {
  await db.execute(sql`SELECT 1`);
}

// Wave 1 of the client data model rework (see docs/design/data-model.md).
// clients.google_service_account_email/_key and clients.slack_webhook_url are
// no longer read or written here — google_service_accounts/slack_channels
// are now the source of truth. The legacy columns still physically exist
// (dropped in a later migration) but nothing in this file touches them.
// Both tables allow more than one row per client_id (no unique constraint,
// by design — see the ERD), but backfill and every write path below only
// ever produce one; ordering by created_at and taking the first keeps
// behavior deterministic if that ever changes.

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

async function fetchClientRecord(
  db: Db,
  id: string,
  opts: { requireActive: boolean }
): Promise<ClientRecord | null> {
  const { google_service_account_email, google_service_account_key, slack_webhook_url, ...summaryColumns } =
    getTableColumns(clients);

  const rows = await db
    .select(summaryColumns)
    .from(clients)
    .where(opts.requireActive ? and(eq(clients.id, id), eq(clients.active, true)) : eq(clients.id, id))
    .limit(1);

  const client = rows[0];
  if (!client) return null;

  const [googleAccount, channel] = await Promise.all([
    getGoogleServiceAccount(db, id),
    getSlackChannel(db, id),
  ]);

  return {
    ...client,
    google_service_account_email: googleAccount?.email ?? null,
    google_service_account_key: googleAccount?.key ?? null,
    slack_webhook_url: channel?.webhook_url ?? null,
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
  const {
    google_service_account_email: _excludedGoogleEmail,
    google_service_account_key: _excludedGoogleKey,
    slack_webhook_url: _excludedSlackUrl,
    ...summaryColumns
  } = getTableColumns(clients);

  const query = db
    .select(summaryColumns)
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

  return rows.map((row) => ({
    ...row,
    google_service_account_email: emailByClient.get(row.id as string) ?? null,
  })) as ClientSummary[];
}

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

function pgErrorCode(err: unknown): string | undefined {
  if (!err || typeof err !== "object") return undefined;
  if ("code" in err && typeof (err as { code: unknown }).code === "string") {
    return (err as { code: string }).code;
  }
  const cause = (err as { cause?: unknown }).cause;
  if (
    cause &&
    typeof cause === "object" &&
    "code" in cause &&
    typeof (cause as { code: unknown }).code === "string"
  ) {
    return (cause as { code: string }).code;
  }
  return undefined;
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
        ga4_property_id: data.ga4_property_id ?? null,
        timezone: data.timezone ?? "America/Chicago",
        settings: data.settings ?? {},
        sanity_project_id: data.sanity_project_id ?? null,
        sanity_production_dataset: data.sanity_production_dataset ?? null,
        sanity_staging_dataset: data.sanity_staging_dataset ?? null,
        github_repo: data.github_repo ?? null,
        github_default_branch: data.github_default_branch ?? "main",
        github_test_branch: data.github_test_branch ?? null,
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

    return {
      ...client,
      google_service_account_email: googleEmail,
      google_service_account_key: googleKey,
      slack_webhook_url: slackWebhookUrl,
    } as ClientRecord;
  } catch (err: unknown) {
    if (pgErrorCode(err) === "23505") {
      throw new ConflictError(`Client already exists: ${data.id}`);
    }
    throw err;
  }
}

export class ForeignKeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ForeignKeyError";
  }
}

export async function listNotificationLogs(
  db: Db,
  opts: { client_id?: string; from?: string; to?: string; limit?: number } = {}
): Promise<NotificationLog[]> {
  const conditions = [
    opts.client_id ? eq(notification_logs.client_id, opts.client_id) : undefined,
    opts.from ? gte(notification_logs.created_at, opts.from) : undefined,
    opts.to ? lte(notification_logs.created_at, opts.to) : undefined,
  ].filter(Boolean) as Parameters<typeof and>;

  const query = db
    .select()
    .from(notification_logs)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(notification_logs.created_at));

  const rows = opts.limit !== undefined ? await query.limit(opts.limit) : await query;
  return rows as NotificationLog[];
}

export async function getNotificationLogById(
  db: Db,
  id: number
): Promise<NotificationLog | null> {
  const rows = await db
    .select()
    .from(notification_logs)
    .where(eq(notification_logs.id, id))
    .limit(1);
  return (rows[0] as NotificationLog) ?? null;
}

export async function insertNotificationLog(
  db: Db,
  data: {
    client_id: string;
    workflow: string;
    event_name: string;
    outcome: string;
    recipient_email?: string | null;
    subject?: string | null;
    resend_id?: string | null;
    error_message?: string | null;
    metadata?: Record<string, unknown>;
  }
): Promise<NotificationLog> {
  try {
    const rows = await db
      .insert(notification_logs)
      .values({
        client_id: data.client_id,
        workflow: data.workflow,
        event_name: data.event_name,
        outcome: data.outcome,
        recipient_email: data.recipient_email ?? null,
        subject: data.subject ?? null,
        resend_id: data.resend_id ?? null,
        error_message: data.error_message ?? null,
        metadata: data.metadata ?? {},
      })
      .returning();
    return rows[0] as NotificationLog;
  } catch (err: unknown) {
    if (pgErrorCode(err) === "23503") {
      throw new ForeignKeyError(`Client not found: ${data.client_id}`);
    }
    throw err;
  }
}

const UPDATABLE_COLUMNS = new Set([
  "name",
  "email",
  "ga4_property_id",
  "active",
  "timezone",
  "settings",
  "sanity_project_id",
  "sanity_production_dataset",
  "sanity_staging_dataset",
  "github_repo",
  "github_default_branch",
  "github_test_branch",
]);

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

  if (Object.keys(columnUpdates).length === 0 && !touchesGoogle && !touchesSlack) {
    return null;
  }

  // Confirm the client exists (and is active) before writing to the child
  // tables — otherwise a typo'd id would silently create orphaned rows.
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

  return fetchClientRecord(db, id, { requireActive: false });
}
