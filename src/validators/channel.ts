import { z } from "zod";

const base = {
  // A human-facing picker name ("Sales team"); unique per client.
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(1000).nullable().optional(),
};

// Keyed on type: a channel and its type-specific half (email_groups or
// slack_channels) are created together. strict() rejects the other type's
// fields, so an email channel sent with a webhookUrl is a 422, not silently
// dropped.
export const createChannelSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("email"),
      ...base,
      emailAddresses: z.array(z.string().trim().email()).min(1),
    })
    .strict(),
  z
    .object({
      type: z.literal("slack"),
      ...base,
      webhookUrl: z.string().trim().url().startsWith("https://hooks.slack.com/"),
    })
    .strict(),
]);

export type CreateChannelInput = z.infer<typeof createChannelSchema>;
