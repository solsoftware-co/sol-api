import { eq, asc } from "drizzle-orm";
import {
  forms,
  form_integrations,
  form_channels,
  form_channel_integrations,
  integrations,
  channels,
  type ChannelType,
} from "../lib/schema.js";
import type { Db } from "../lib/db.js";

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
export async function getFormById(db: Db, formId: string): Promise<FormRow | null> {
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
    .where(eq(forms.id, formId))
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
