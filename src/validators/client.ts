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
});

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
  })
  .refine(
    (data) => Object.keys(data).length > 0,
    { message: "At least one field must be provided" }
  );

export type CreateClientInput = z.infer<typeof createClientSchema>;
export type UpdateClientInput = z.infer<typeof updateClientSchema>;
