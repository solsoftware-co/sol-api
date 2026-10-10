import type { Db } from "../lib/db.js";
import {
  getClientForm,
  listFormIntegrations,
  listFormChannels,
  listFormChannelIntegrations,
  insertForm,
  updateForm as updateFormRow,
  upsertFormIntegration,
  deleteFormIntegration,
  upsertFormChannel,
  deleteFormChannel,
  notRunError,
  FormNotFoundError,
  LinkTargetNotFoundError,
} from "../repositories/forms.js";
import { findMissingIds, InvalidReferencesError } from "../repositories/references.js";
import { integrations, channels } from "../lib/schema.js";
import type {
  CreateFormInput,
  UpdateFormInput,
  PutFormIntegrationInput,
  PutFormChannelInput,
} from "../validators/form.js";

export { ClientNotFoundError } from "../repositories/clients.js";
export { FormNotFoundError, LinkTargetNotFoundError } from "../repositories/forms.js";
export { InvalidReferencesError } from "../repositories/references.js";
import { snakeToCamelKeys } from "../lib/case.js";
import type { ChannelType } from "../lib/schema.js";

export interface FormResponse {
  id: string;
  clientId: string;
  name: string;
  description: string | null;
  payloadSchema: Record<string, unknown>;
  allowedOrigins: string[];
  createdAt: string;
  updatedAt: string;
  integrations: {
    integrationId: string;
    type: string;
    name: string | null;
    status: string;
    fieldMapping: Record<string, unknown>;
  }[];
  channels: {
    channelId: string;
    type: ChannelType;
    name: string;
    template: string;
    subject: string | null;
    includeFields: string[] | null;
    message: string | null;
    /** Which of the form's integrations this notification reports on. Opt-in: empty means none. */
    integrationIds: string[];
  }[];
}

// Everything Sol Gate needs to process a submission to this form, in one
// response: what to validate, which integrations to run (and how to map
// fields onto them), and which channels to notify (and about which
// integrations). No credentials of any kind.
export async function getForm(db: Db, clientId: string, formId: string): Promise<FormResponse | null> {
  const form = await getClientForm(db, clientId, formId);
  if (!form) return null;

  const [integrationRows, channelRows, reportRows] = await Promise.all([
    listFormIntegrations(db, formId),
    listFormChannels(db, formId),
    listFormChannelIntegrations(db, formId),
  ]);

  return {
    ...snakeToCamelKeys(form),
    integrations: integrationRows.map((row) => snakeToCamelKeys(row)),
    channels: channelRows.map((row) => ({
      ...snakeToCamelKeys(row),
      integrationIds: reportRows.filter((r) => r.channel_id === row.channel_id).map((r) => r.integration_id),
    })),
  };
}

// Every write below responds with the whole form, as GET /forms/:id returns it.
async function readBack(db: Db, clientId: string, formId: string): Promise<FormResponse> {
  const form = await getForm(db, clientId, formId);
  if (!form) throw new FormNotFoundError(formId);
  return form;
}

async function requireForm(db: Db, clientId: string, formId: string): Promise<void> {
  if (!(await getClientForm(db, clientId, formId))) throw new FormNotFoundError(formId);
}

// Integrations and channels are references only: each must already be one of
// this client's, checked here so the 422 names the bad ids (an unknown id and
// another client's id are reported identically).
export async function createForm(db: Db, clientId: string, input: CreateFormInput): Promise<FormResponse> {
  const [integrationIds, channelIds] = await Promise.all([
    findMissingIds(db, integrations, clientId, input.integrations.map((i) => i.integrationId)),
    findMissingIds(db, channels, clientId, input.channels.map((c) => c.channelId)),
  ]);
  if (integrationIds.length > 0 || channelIds.length > 0) {
    const details: Record<string, string[]> = {};
    if (integrationIds.length > 0) details.integrationIds = integrationIds;
    if (channelIds.length > 0) details.channelIds = channelIds;
    throw new InvalidReferencesError(details);
  }

  const id = await insertForm(db, {
    client_id: clientId,
    name: input.name,
    description: input.description ?? null,
    payload_schema: input.payloadSchema,
    integrations: input.integrations.map((i) => ({ integration_id: i.integrationId, field_mapping: i.fieldMapping })),
    channels: input.channels.map((c) => ({
      channel_id: c.channelId,
      template: c.template,
      subject: c.subject ?? null,
      include_fields: c.includeFields ?? null,
      message: c.message ?? null,
      integration_ids: c.integrationIds,
    })),
  });
  return readBack(db, clientId, id);
}

export async function updateForm(
  db: Db,
  clientId: string,
  formId: string,
  input: UpdateFormInput
): Promise<FormResponse> {
  const found = await updateFormRow(db, clientId, formId, {
    ...(input.name !== undefined && { name: input.name }),
    ...(input.description !== undefined && { description: input.description }),
    ...(input.payloadSchema !== undefined && { payload_schema: input.payloadSchema }),
  });
  if (!found) throw new FormNotFoundError(formId);
  return readBack(db, clientId, formId);
}

// Adds the integration to the form, or replaces its field mapping.
export async function putFormIntegration(
  db: Db,
  clientId: string,
  formId: string,
  integrationId: string,
  input: PutFormIntegrationInput
): Promise<FormResponse> {
  await requireForm(db, clientId, formId);
  const missing = await findMissingIds(db, integrations, clientId, [integrationId]);
  if (missing.length > 0) throw new LinkTargetNotFoundError("Integration", integrationId);

  await upsertFormIntegration(db, clientId, formId, integrationId, input.fieldMapping);
  return readBack(db, clientId, formId);
}

// Also removes it from every notification that reported on it.
export async function removeFormIntegration(
  db: Db,
  clientId: string,
  formId: string,
  integrationId: string
): Promise<FormResponse> {
  await requireForm(db, clientId, formId);
  const linked = (await listFormIntegrations(db, formId)).some((i) => i.integration_id === integrationId);
  if (!linked) throw new LinkTargetNotFoundError("Integration", integrationId);

  await deleteFormIntegration(db, clientId, formId, integrationId);
  return readBack(db, clientId, formId);
}

// Adds the channel to the form, or replaces how the form notifies it. Settings
// left out go back to their defaults; integrationIds must be integrations the
// form already runs.
export async function putFormChannel(
  db: Db,
  clientId: string,
  formId: string,
  channelId: string,
  input: PutFormChannelInput
): Promise<FormResponse> {
  await requireForm(db, clientId, formId);
  const [missing, formIntegrations] = await Promise.all([
    findMissingIds(db, channels, clientId, [channelId]),
    listFormIntegrations(db, formId),
  ]);
  if (missing.length > 0) throw new LinkTargetNotFoundError("Channel", channelId);
  const runs = new Set(formIntegrations.map((i) => i.integration_id));
  const notRun = input.integrationIds.filter((id) => !runs.has(id));
  if (notRun.length > 0) throw notRunError(notRun);

  await upsertFormChannel(db, clientId, formId, {
    channel_id: channelId,
    template: input.template,
    subject: input.subject ?? null,
    include_fields: input.includeFields ?? null,
    message: input.message ?? null,
    integration_ids: input.integrationIds,
  });
  return readBack(db, clientId, formId);
}

export async function removeFormChannel(
  db: Db,
  clientId: string,
  formId: string,
  channelId: string
): Promise<FormResponse> {
  await requireForm(db, clientId, formId);
  const linked = (await listFormChannels(db, formId)).some((c) => c.channel_id === channelId);
  if (!linked) throw new LinkTargetNotFoundError("Channel", channelId);

  await deleteFormChannel(db, clientId, formId, channelId);
  return readBack(db, clientId, formId);
}

