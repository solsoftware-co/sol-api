import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { eq, and, gte, lte, desc, getTableColumns } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { clients, notification_logs } from "./schema.js";
import type { ClientRecord, ClientSummary, NotificationLog } from "../types/index.js";

export type Db = ReturnType<typeof drizzle>;

export function createDb(url: string): Db {
  return drizzle(neon(url));
}

export async function healthCheck(db: Db): Promise<void> {
  await db.execute(sql`SELECT 1`);
}

export async function getClientById(
  db: Db,
  id: string
): Promise<ClientRecord | null> {
  const rows = await db
    .select()
    .from(clients)
    .where(and(eq(clients.id, id), eq(clients.active, true)))
    .limit(1);
  return (rows[0] as ClientRecord) ?? null;
}

export async function listClients(
  db: Db,
  opts: { limit?: number; email?: string } = {}
): Promise<ClientSummary[]> {
  const { google_service_account_key: _excluded, ...summaryColumns } =
    getTableColumns(clients);

  const conditions = [eq(clients.active, true)];
  if (opts.email !== undefined) {
    conditions.push(eq(clients.email, opts.email));
  }

  const query = db
    .select(summaryColumns)
    .from(clients)
    .where(and(...conditions));

  const rows =
    opts.limit !== undefined
      ? await query.limit(opts.limit)
      : await query;

  return rows as ClientSummary[];
}

export class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConflictError";
  }
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
    default_email?: string | null;
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
        google_service_account_email: data.google_service_account_email ?? null,
        google_service_account_key: data.google_service_account_key ?? null,
        sanity_project_id: data.sanity_project_id ?? null,
        sanity_production_dataset: data.sanity_production_dataset ?? null,
        sanity_staging_dataset: data.sanity_staging_dataset ?? null,
        github_repo: data.github_repo ?? null,
        github_default_branch: data.github_default_branch ?? "main",
        github_test_branch: data.github_test_branch ?? null,
        default_email: data.default_email ?? null,
      })
      .returning();
    return rows[0] as ClientRecord;
  } catch (err: unknown) {
    if (
      err &&
      typeof err === "object" &&
      "code" in err &&
      (err as { code: string }).code === "23505"
    ) {
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
    if (err && typeof err === "object" && "code" in err) {
      const code = (err as { code: string }).code;
      if (code === "23503") {
        throw new ForeignKeyError(`Client not found: ${data.client_id}`);
      }
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
  "google_service_account_email",
  "google_service_account_key",
  "sanity_project_id",
  "sanity_production_dataset",
  "sanity_staging_dataset",
  "github_repo",
  "github_default_branch",
  "github_test_branch",
  "default_email",
]);

export async function updateClient(
  db: Db,
  id: string,
  data: Record<string, unknown>
): Promise<ClientRecord | null> {
  const updates = Object.fromEntries(
    Object.entries(data).filter(
      ([key, val]) => UPDATABLE_COLUMNS.has(key) && val !== undefined
    )
  );

  if (Object.keys(updates).length === 0) return null;

  const rows = await db
    .update(clients)
    .set(updates)
    .where(eq(clients.id, id))
    .returning();

  return (rows[0] as ClientRecord) ?? null;
}
