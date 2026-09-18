import { eq, and, gte, lte, desc } from "drizzle-orm";
import { notification_logs } from "../lib/schema.js";
import type { Db } from "../lib/db.js";
import { pgErrorCode } from "../lib/pg-errors.js";
import type { NotificationLog } from "../types/index.js";

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

export async function getNotificationLogById(db: Db, id: number): Promise<NotificationLog | null> {
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
    type?: string;
    recipient_email?: string | null;
    subject?: string | null;
    resend_id?: string | null;
    slack_webhook_url?: string | null;
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
        type: data.type ?? "email",
        recipient_email: data.recipient_email ?? null,
        subject: data.subject ?? null,
        resend_id: data.resend_id ?? null,
        slack_webhook_url: data.slack_webhook_url ?? null,
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
