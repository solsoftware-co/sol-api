import { z } from "zod";

export const createGoogleServiceAccountSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    description: z.string().trim().max(1000).nullable().optional(),
    // The service account's own address, e.g. x@project.iam.gserviceaccount.com.
    email: z.string().trim().email(),
    // Write-only: stored, never returned by these routes.
    key: z.string().min(1),
  })
  .strict();

export type CreateGoogleServiceAccountInput = z.infer<typeof createGoogleServiceAccountSchema>;
