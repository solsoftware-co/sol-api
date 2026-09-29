import { z } from "zod";

export const createFormApiKeySchema = z.object({
  // Which site holds the key, e.g. "acme.com production".
  name: z.string().trim().min(1).max(200),
  expiresAt: z
    .string()
    .datetime({ offset: true })
    .refine((v) => Date.parse(v) > Date.now(), { message: "expiresAt must be in the future" })
    .nullable()
    .optional(),
});

export type CreateFormApiKeyInput = z.infer<typeof createFormApiKeySchema>;

export const verifyFormApiKeySchema = z.object({
  key: z.string().min(1),
});

export type VerifyFormApiKeyInput = z.infer<typeof verifyFormApiKeySchema>;
