import { z } from "zod";

export const createNotificationLogSchema = z.object({
  clientId: z.string().min(1),
  workflow: z.string().min(1),
  eventName: z.string().min(1),
  outcome: z.string().min(1),
  type: z.string().min(1).optional().default("email"),
  recipientEmail: z.string().nullable().optional(),
  subject: z.string().nullable().optional(),
  resendId: z.string().nullable().optional(),
  slackWebhookUrl: z.string().url().nullable().optional(),
  errorMessage: z.string().nullable().optional(),
  metadata: z.record(z.unknown()).optional().default({}),
});

export type CreateNotificationLogInput = z.infer<typeof createNotificationLogSchema>;
