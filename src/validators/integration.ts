import { z } from "zod";

const base = {
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(1000).nullable().optional(),
};

// Keyed on type: an integration and its type-specific half
// (mailchimp_integrations or google_sheets_integrations) are created together.
// strict() rejects the other type's fields.
export const createIntegrationSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("mailchimp"),
      ...base,
      apiKey: z.string().trim().min(1),
      // Audience ID: Audience → Settings → Audience name and defaults.
      listId: z.string().trim().min(1),
      // The datacenter after the dash in the API key, e.g. "us14". Anything
      // else isn't a Mailchimp host, so every write would fail.
      serverPrefix: z
        .string()
        .trim()
        .regex(/^[a-z]+\d+$/, 'must be a Mailchimp datacenter, e.g. "us14"'),
    })
    .strict(),
  z
    .object({
      type: z.literal("google_sheets"),
      ...base,
      // A reference: must be one of this client's service accounts.
      googleServiceAccountId: z.string().uuid(),
      spreadsheetId: z.string().trim().min(1),
      // Omitted or null: the first sheet.
      sheetName: z.string().trim().min(1).nullable().optional(),
      // Ordered field keys, e.g. ["_timestamp", "submitterEmail"].
      columnMapping: z.array(z.string().trim().min(1)).min(1),
      // Top-left cell of the table, e.g. "B2"; omitted means "A1".
      tableAnchor: z
        .string()
        .trim()
        .regex(/^[A-Z]{1,3}[1-9]\d*$/, 'must be a cell reference, e.g. "A1"')
        .optional(),
    })
    .strict(),
]);

export type CreateIntegrationInput = z.infer<typeof createIntegrationSchema>;
