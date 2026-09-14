import { z } from "zod";

const SUPPORTED_TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
] as const;

const timezoneEnum = z.enum(SUPPORTED_TIMEZONES);

export const createClientSchema = z.object({
  id: z
    .string()
    .min(1)
    .max(100)
    .regex(/^\S+$/, "id must not contain spaces"),
  name: z.string().min(1).max(200),
  email: z.string().includes("@", { message: "email must contain @" }),
  ga4_property_id: z.string().nullable().optional(),
  timezone: timezoneEnum.optional(),
  settings: z.record(z.unknown()).optional().default({}),
  google_service_account_email: z
    .string()
    .includes("@", { message: "google_service_account_email must contain @" })
    .nullable()
    .optional(),
  google_service_account_key: z.string().nullable().optional(),
  sanity_project_id: z.string().nullable().optional(),
  sanity_production_dataset: z.string().nullable().optional(),
  sanity_staging_dataset: z.string().nullable().optional(),
  github_repo: z.string().nullable().optional(),
  github_default_branch: z.string().nullable().optional().default("main"),
  github_test_branch: z.string().nullable().optional(),
  slack_webhook_url: z.string().url().nullable().optional(),
}).refine(
  (data) => Boolean(data.google_service_account_email) === Boolean(data.google_service_account_key),
  {
    message: "google_service_account_email and google_service_account_key must be provided together",
    path: ["google_service_account_key"],
  }
).refine(
  (data) => {
    const vals = [data.sanity_project_id, data.sanity_production_dataset, data.sanity_staging_dataset];
    return vals.every((v) => v != null) || vals.every((v) => v == null);
  },
  {
    message: "sanity_project_id, sanity_production_dataset, and sanity_staging_dataset must be provided together",
    path: ["sanity_project_id"],
  }
);

export const updateClientSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    email: z
      .string()
      .includes("@", { message: "email must contain @" })
      .optional(),
    ga4_property_id: z.string().nullable().optional(),
    active: z.boolean().optional(),
    timezone: timezoneEnum.optional(),
    settings: z.record(z.unknown()).optional(),
    google_service_account_email: z
      .string()
      .includes("@", { message: "google_service_account_email must contain @" })
      .nullable()
      .optional(),
    google_service_account_key: z.string().nullable().optional(),
    sanity_project_id: z.string().nullable().optional(),
    sanity_production_dataset: z.string().nullable().optional(),
    sanity_staging_dataset: z.string().nullable().optional(),
    github_repo: z.string().nullable().optional(),
    github_default_branch: z.string().nullable().optional(),
    github_test_branch: z.string().nullable().optional(),
    slack_webhook_url: z.string().url().nullable().optional(),
  })
  .refine(
    (data) => Object.keys(data).length > 0,
    { message: "At least one field must be provided" }
  );

export type CreateClientInput = z.infer<typeof createClientSchema>;
export type UpdateClientInput = z.infer<typeof updateClientSchema>;
