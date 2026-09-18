// Frozen fork of today's notification-logs insert, for sol-notificaiton-service
// to move onto before /v1/notification-logs is cut over to its new camelCase
// contract (see the SOL-7 plan's sequencing section). Writes rely on the
// notification_logs.type column's DB default ('email') — this contract never
// sends type or slack_webhook_url.
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

export async function insertLegacyNotificationLog(
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
