import { z } from "zod";

// Postgres returns uuids lowercase; normalizing here lets every comparison
// (duplicates, subsets, the reference check) be a plain string compare.
const uuid = z
  .string()
  .uuid()
  .transform((id) => id.toLowerCase());

const fieldMapping = z.record(z.unknown());

const formFields = {
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(1000).nullable().optional(),
  // A JSON Schema (2020-12) Sol Gate validates every submission against.
  payloadSchema: z.record(z.unknown()),
};

// How a form notifies one channel. integrationIds are the form's integrations
// this notification reports on; empty means it reports on none (e.g. a plain
// "form submitted" message).
const channelSettings = {
  // A sol-notify template name; omitted means "form_submission".
  template: z.string().trim().min(1).max(100).optional(),
  // Email only: Slack messages have no subject.
  subject: z.string().trim().min(1).max(300).nullable().optional(),
  // null or omitted means every submitted field.
  includeFields: z.array(z.string().trim().min(1)).nullable().optional(),
  // Fixed text (e.g. a Slack message), no substitution.
  message: z.string().trim().min(1).max(2000).nullable().optional(),
  integrationIds: z.array(uuid).default([]),
};

function duplicates(ids: string[]): string[] {
  return [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))];
}

// The create body mirrors GET /forms/:id. Integrations and channels are
// references to existing records (checked against the client before the
// insert); each link carries its own settings.
export const createFormSchema = z
  .object({
    ...formFields,
    integrations: z
      .array(z.object({ integrationId: uuid, fieldMapping: fieldMapping.default({}) }).strict())
      .default([]),
    channels: z.array(z.object({ channelId: uuid, ...channelSettings }).strict()).default([]),
  })
  .strict()
  .superRefine((form, ctx) => {
    const integrationIds = form.integrations.map((i) => i.integrationId);
    for (const id of duplicates(integrationIds)) {
      ctx.addIssue({ code: "custom", path: ["integrations"], message: `Integration listed more than once: ${id}` });
    }
    for (const id of duplicates(form.channels.map((c) => c.channelId))) {
      ctx.addIssue({ code: "custom", path: ["channels"], message: `Channel listed more than once: ${id}` });
    }
    const runs = new Set(integrationIds);
    form.channels.forEach((channel, i) => {
      for (const id of duplicates(channel.integrationIds)) {
        ctx.addIssue({
          code: "custom",
          path: ["channels", i, "integrationIds"],
          message: `Integration listed more than once: ${id}`,
        });
      }
      for (const id of channel.integrationIds.filter((id) => !runs.has(id))) {
        ctx.addIssue({
          code: "custom",
          path: ["channels", i, "integrationIds"],
          message: `A notification can only report on the form's own integrations: ${id}`,
        });
      }
    });
  });

export type CreateFormInput = z.infer<typeof createFormSchema>;

// The form's own columns. Links have their own routes.
export const updateFormSchema = z
  .object({
    name: formFields.name.optional(),
    description: formFields.description,
    payloadSchema: formFields.payloadSchema.optional(),
  })
  .strict()
  .refine((patch) => Object.keys(patch).length > 0, { message: "Nothing to update" });

export type UpdateFormInput = z.infer<typeof updateFormSchema>;

// PUT replaces the whole link, so omitted settings go back to their defaults.
export const putFormIntegrationSchema = z.object({ fieldMapping: fieldMapping.default({}) }).strict();

export type PutFormIntegrationInput = z.infer<typeof putFormIntegrationSchema>;

export const putFormChannelSchema = z
  .object(channelSettings)
  .strict()
  .superRefine((link, ctx) => {
    for (const id of duplicates(link.integrationIds)) {
      ctx.addIssue({ code: "custom", path: ["integrationIds"], message: `Integration listed more than once: ${id}` });
    }
  });

export type PutFormChannelInput = z.infer<typeof putFormChannelSchema>;
