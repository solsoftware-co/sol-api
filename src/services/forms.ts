import type { Db } from "../lib/db.js";
import {
  getFormById,
  listFormIntegrations,
  listFormChannels,
  listFormChannelIntegrations,
} from "../repositories/forms.js";
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
export async function getForm(db: Db, formId: string): Promise<FormResponse | null> {
  const form = await getFormById(db, formId);
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
