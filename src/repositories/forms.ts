import { eq, and, asc, sql } from "drizzle-orm";
import {
  forms,
  form_integrations,
  form_channels,
  form_channel_integrations,
  integrations,
  channels,
  type ChannelType,
} from "../lib/schema.js";
import type { BatchItem } from "drizzle-orm/batch";
import type { Db } from "../lib/db.js";
import { pgErrorCode, pgErrorConstraint } from "../lib/pg-errors.js";
import { ClientNotFoundError } from "./clients.js";
import { findMissingIds, InvalidReferencesError } from "./references.js";

export class FormNotFoundError extends Error {
  constructor(formId: string) {
    super(`Form not found: ${formId}`);
    this.name = "FormNotFoundError";
  }
}

// A link route's path names an integration or channel that isn't this
// client's (unknown and other-client ids alike): a 404, since the id is in
// the path, not the body.
export class LinkTargetNotFoundError extends Error {
  constructor(kind: "Integration" | "Channel", id: string) {
    super(`${kind} not found: ${id}`);
    this.name = "LinkTargetNotFoundError";
  }
}

export interface FormRow {
  id: string;
  client_id: string;
  name: string;
  description: string | null;
  payload_schema: Record<string, unknown>;
  allowed_origins: string[];
  created_at: string;
  updated_at: string;
}

export interface FormIntegrationRow {
  integration_id: string;
  type: string;
  name: string | null;
  status: string;
  field_mapping: Record<string, unknown>;
}

export interface FormChannelRow {
  channel_id: string;
  type: ChannelType;
  name: string;
  template: string;
  subject: string | null;
  include_fields: string[] | null;
  message: string | null;
}

export interface FormChannelIntegrationRow {
  channel_id: string;
  integration_id: string;
}

// Not client-scoped: Sol Gate resolves a form from the public submission URL,
// which carries only the form id. The response (built in services/forms.ts)
// carries the form's clientId instead.
export async function getClientForm(db: Db, clientId: string, formId: string): Promise<FormRow | null> {
  const rows = await db
    .select({
      id: forms.id,
      client_id: forms.client_id,
      name: forms.name,
      description: forms.description,
      payload_schema: forms.payload_schema,
      allowed_origins: forms.allowed_origins,
      created_at: forms.created_at,
      updated_at: forms.updated_at,
    })
    .from(forms)
    .where(and(eq(forms.id, formId), eq(forms.client_id, clientId)))
    .limit(1);
  return rows[0] ?? null;
}

// Never selects the integration's credentials (mailchimp_integrations /
// google_sheets_integrations are not joined) — sol-integrate fetches its own
// via GET /v1/clients/:clientId/integrations/:integrationId.
export async function listFormIntegrations(db: Db, formId: string): Promise<FormIntegrationRow[]> {
  return db
    .select({
      integration_id: form_integrations.integration_id,
      type: integrations.type,
      name: integrations.name,
      status: integrations.status,
      field_mapping: form_integrations.field_mapping,
    })
    .from(form_integrations)
    .innerJoin(integrations, eq(integrations.id, form_integrations.integration_id))
    .where(eq(form_integrations.form_id, formId))
    .orderBy(asc(integrations.created_at), asc(integrations.id));
}

// Never selects Slack webhooks or email addresses — recipients are resolved
// separately via GET /v1/clients/:clientId/channels?ids=…
export async function listFormChannels(db: Db, formId: string): Promise<FormChannelRow[]> {
  return db
    .select({
      channel_id: form_channels.channel_id,
      type: channels.type,
      name: channels.name,
      template: form_channels.template,
      subject: form_channels.subject,
      include_fields: form_channels.include_fields,
      message: form_channels.message,
    })
    .from(form_channels)
    .innerJoin(channels, eq(channels.id, form_channels.channel_id))
    .where(eq(form_channels.form_id, formId))
    .orderBy(asc(channels.name));
}

export async function listFormChannelIntegrations(db: Db, formId: string): Promise<FormChannelIntegrationRow[]> {
  return db
    .select({
      channel_id: form_channel_integrations.channel_id,
      integration_id: form_channel_integrations.integration_id,
    })
    .from(form_channel_integrations)
    .where(eq(form_channel_integrations.form_id, formId));
}

// ── Writes ──────────────────────────────────────────────────────────────────
// Every write is one db.batch (one transaction over neon-http). Callers check
// references first so errors name the bad ids; the composite FKs are the
// actual guarantee, and an FK failure that slips past a check (a race) maps to
// the same error the check gives.

export interface NewFormChannelLink {
  channel_id: string;
  template?: string;
  subject: string | null;
  include_fields: string[] | null;
  message: string | null;
  integration_ids: string[];
}

export interface NewForm {
  client_id: string;
  name: string;
  description: string | null;
  payload_schema: Record<string, unknown>;
  integrations: { integration_id: string; field_mapping: Record<string, unknown> }[];
  channels: NewFormChannelLink[];
}

function touchForm(db: Db, clientId: string, formId: string) {
  return db
    .update(forms)
    .set({ updated_at: sql`now()` })
    .where(and(eq(forms.id, formId), eq(forms.client_id, clientId)));
}

function channelLinkValues(link: NewFormChannelLink) {
  return {
    template: link.template ?? "form_submission",
    subject: link.subject,
    include_fields: link.include_fields,
    message: link.message,
  };
}

// The 422 for a create whose integrations or channels stopped being this
// client's between the check and the insert: recomputed, so it's identical
// to the one the check would have given.
async function referenceError(db: Db, data: NewForm): Promise<InvalidReferencesError | null> {
  const [integrationIds, channelIds] = await Promise.all([
    findMissingIds(db, integrations, data.client_id, data.integrations.map((i) => i.integration_id)),
    findMissingIds(db, channels, data.client_id, data.channels.map((c) => c.channel_id)),
  ]);
  const details: Record<string, string[]> = {};
  if (integrationIds.length > 0) details.integrationIds = integrationIds;
  if (channelIds.length > 0) details.channelIds = channelIds;
  return Object.keys(details).length > 0 ? new InvalidReferencesError(details) : null;
}

export async function insertForm(db: Db, data: NewForm): Promise<string> {
  const id = crypto.randomUUID();
  const statements: BatchItem<"pg">[] = [
    db.insert(forms).values({
      id,
      client_id: data.client_id,
      name: data.name,
      description: data.description,
      payload_schema: data.payload_schema,
    }),
    ...(data.integrations.length > 0
      ? [
          db.insert(form_integrations).values(
            data.integrations.map((i) => ({ form_id: id, client_id: data.client_id, ...i }))
          ),
        ]
      : []),
    ...(data.channels.length > 0
      ? [
          db.insert(form_channels).values(
            data.channels.map((c) => ({
              form_id: id,
              channel_id: c.channel_id,
              client_id: data.client_id,
              ...channelLinkValues(c),
            }))
          ),
        ]
      : []),
  ];
  const reports = data.channels.flatMap((c) =>
    c.integration_ids.map((integration_id) => ({ form_id: id, channel_id: c.channel_id, integration_id }))
  );
  if (reports.length > 0) statements.push(db.insert(form_channel_integrations).values(reports));

  try {
    await db.batch(statements as [BatchItem<"pg">, ...BatchItem<"pg">[]]);
    return id;
  } catch (err: unknown) {
    if (pgErrorCode(err) === "23503") {
      const constraint = pgErrorConstraint(err);
      if (constraint === "forms_client_id_fkey") throw new ClientNotFoundError(data.client_id);
      if (
        constraint === "form_integrations_client_id_integration_id_fkey" ||
        constraint === "form_channels_client_id_channel_id_fkey"
      ) {
        const refErr = await referenceError(db, data);
        if (refErr) throw refErr;
      }
    }
    throw err;
  }
}

// False when the form isn't this client's.
export async function updateForm(
  db: Db,
  clientId: string,
  formId: string,
  patch: { name?: string; description?: string | null; payload_schema?: Record<string, unknown> }
): Promise<boolean> {
  const rows = await db
    .update(forms)
    .set({ ...patch, updated_at: sql`now()` })
    .where(and(eq(forms.id, formId), eq(forms.client_id, clientId)))
    .returning({ id: forms.id });
  return rows.length > 0;
}

export async function upsertFormIntegration(
  db: Db,
  clientId: string,
  formId: string,
  integrationId: string,
  fieldMapping: Record<string, unknown>
): Promise<void> {
  try {
    await db.batch([
      db
        .insert(form_integrations)
        .values({ form_id: formId, integration_id: integrationId, client_id: clientId, field_mapping: fieldMapping })
        .onConflictDoUpdate({
          target: [form_integrations.form_id, form_integrations.integration_id],
          set: { field_mapping: fieldMapping },
        }),
      touchForm(db, clientId, formId),
    ]);
  } catch (err: unknown) {
    if (pgErrorCode(err) === "23503") {
      const constraint = pgErrorConstraint(err);
      if (constraint === "form_integrations_client_id_form_id_fkey") throw new FormNotFoundError(formId);
      if (constraint === "form_integrations_client_id_integration_id_fkey") {
        throw new LinkTargetNotFoundError("Integration", integrationId);
      }
    }
    throw err;
  }
}

// Removes the integration from the form, and from every notification that
// reported on it, in one transaction.
export async function deleteFormIntegration(
  db: Db,
  clientId: string,
  formId: string,
  integrationId: string
): Promise<void> {
  await db.batch([
    db
      .delete(form_channel_integrations)
      .where(
        and(
          eq(form_channel_integrations.form_id, formId),
          eq(form_channel_integrations.integration_id, integrationId)
        )
      ),
    db
      .delete(form_integrations)
      .where(
        and(
          eq(form_integrations.form_id, formId),
          eq(form_integrations.integration_id, integrationId),
          eq(form_integrations.client_id, clientId)
        )
      ),
    touchForm(db, clientId, formId),
  ]);
}

// Replaces the link's settings and the integrations it reports on.
export async function upsertFormChannel(
  db: Db,
  clientId: string,
  formId: string,
  link: NewFormChannelLink
): Promise<void> {
  const settings = channelLinkValues(link);
  const statements: BatchItem<"pg">[] = [
    db
      .insert(form_channels)
      .values({ form_id: formId, channel_id: link.channel_id, client_id: clientId, ...settings })
      .onConflictDoUpdate({ target: [form_channels.form_id, form_channels.channel_id], set: settings }),
    db
      .delete(form_channel_integrations)
      .where(
        and(eq(form_channel_integrations.form_id, formId), eq(form_channel_integrations.channel_id, link.channel_id))
      ),
    ...(link.integration_ids.length > 0
      ? [
          db.insert(form_channel_integrations).values(
            link.integration_ids.map((integration_id) => ({
              form_id: formId,
              channel_id: link.channel_id,
              integration_id,
            }))
          ),
        ]
      : []),
    touchForm(db, clientId, formId),
  ];

  try {
    await db.batch(statements as [BatchItem<"pg">, ...BatchItem<"pg">[]]);
  } catch (err: unknown) {
    if (pgErrorCode(err) === "23503") {
      const constraint = pgErrorConstraint(err);
      if (constraint === "form_channels_client_id_form_id_fkey") throw new FormNotFoundError(formId);
      if (constraint === "form_channels_client_id_channel_id_fkey") {
        throw new LinkTargetNotFoundError("Channel", link.channel_id);
      }
      if (constraint === "form_channel_integrations_form_id_integration_id_fkey") {
        const runs = new Set((await listFormIntegrations(db, formId)).map((i) => i.integration_id));
        const notRun = link.integration_ids.filter((id) => !runs.has(id));
        if (notRun.length > 0) throw notRunError(notRun);
      }
    }
    throw err;
  }
}

export function notRunError(integrationIds: string[]): InvalidReferencesError {
  return new InvalidReferencesError({ integrationIds }, "A notification can only report on the form's own integrations");
}

export async function deleteFormChannel(db: Db, clientId: string, formId: string, channelId: string): Promise<void> {
  await db.batch([
    db
      .delete(form_channel_integrations)
      .where(and(eq(form_channel_integrations.form_id, formId), eq(form_channel_integrations.channel_id, channelId))),
    db
      .delete(form_channels)
      .where(
        and(
          eq(form_channels.form_id, formId),
          eq(form_channels.channel_id, channelId),
          eq(form_channels.client_id, clientId)
        )
      ),
    touchForm(db, clientId, formId),
  ]);
}

