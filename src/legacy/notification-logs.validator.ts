// Frozen fork of today's POST /v1/notification-logs contract, as sol-notificaiton-service
// was built against — no type/slack_webhook_url in the request shape. See
// notification-logs.route.ts for the isolation rationale and the SOL-7 cutover sequencing.
import { z } from "zod";

export const createLegacyNotificationLogSchema = z.object({
  client_id: z.string().min(1),
  workflow: z.string().min(1),
  event_name: z.string().min(1),
  outcome: z.string().min(1),
  recipient_email: z.string().nullable().optional(),
  subject: z.string().nullable().optional(),
  resend_id: z.string().nullable().optional(),
  error_message: z.string().nullable().optional(),
  metadata: z.record(z.unknown()).optional().default({}),
});

export type CreateLegacyNotificationLogInput = z.infer<typeof createLegacyNotificationLogSchema>;
