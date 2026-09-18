import type { Db } from "../lib/db.js";
import {
  listNotificationLogs as listNotificationLogsRepo,
  getNotificationLogById as getNotificationLogByIdRepo,
  insertNotificationLog,
} from "../repositories/notification-logs.js";
import { snakeToCamelKeys } from "../lib/case.js";
import type { CreateNotificationLogInput } from "../validators/notification-log.js";

export interface NotificationLogResponse {
  id: number;
  clientId: string;
  workflow: string;
  eventName: string;
  outcome: string;
  createdAt: string;
  type: string;
  recipientEmail: string | null;
  subject: string | null;
  resendId: string | null;
  slackWebhookUrl: string | null;
  errorMessage: string | null;
  metadata: Record<string, unknown>;
}

export async function createNotificationLog(
  db: Db,
  input: CreateNotificationLogInput
): Promise<NotificationLogResponse> {
  const row = await insertNotificationLog(db, {
    client_id: input.clientId,
    workflow: input.workflow,
    event_name: input.eventName,
    outcome: input.outcome,
    type: input.type,
    recipient_email: input.recipientEmail,
    subject: input.subject,
    resend_id: input.resendId,
    slack_webhook_url: input.slackWebhookUrl,
    error_message: input.errorMessage,
    metadata: input.metadata,
  });
  return snakeToCamelKeys(row);
}

export async function listNotificationLogs(
  db: Db,
  opts: { clientId?: string; from?: string; to?: string; limit?: number } = {}
): Promise<NotificationLogResponse[]> {
  const rows = await listNotificationLogsRepo(db, {
    client_id: opts.clientId,
    from: opts.from,
    to: opts.to,
    limit: opts.limit,
  });
  return rows.map((row) => snakeToCamelKeys(row));
}

export async function getNotificationLog(db: Db, id: number): Promise<NotificationLogResponse | null> {
  const row = await getNotificationLogByIdRepo(db, id);
  if (!row) return null;
  return snakeToCamelKeys(row);
}
