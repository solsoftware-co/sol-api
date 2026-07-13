import { z } from "zod";

export const createNotificationLogSchema = z.object({
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

export type CreateNotificationLogInput = z.infer<typeof createNotificationLogSchema>;
