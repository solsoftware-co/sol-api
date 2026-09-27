import type { Db } from "../lib/db.js";
import type { ChannelType } from "../lib/schema.js";
import { listClientChannels, getClientChannel, type ChannelRow } from "../repositories/channels.js";

export interface ChannelResponse {
  id: string;
  clientId: string;
  type: ChannelType;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  /** Email channels only. null if the channel has no email_groups row. */
  email?: { emailAddresses: string[] } | null;
  /** Slack channels only. null if the channel has no slack_channels row. */
  slack?: { webhookUrl: string } | null;
}

function toResponse(row: ChannelRow): ChannelResponse {
  const base: ChannelResponse = {
    id: row.id,
    clientId: row.client_id,
    type: row.type,
    name: row.name,
    description: row.description,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
  if (row.type === "email") {
    return { ...base, email: row.email_addresses ? { emailAddresses: row.email_addresses } : null };
  }
  if (row.type === "slack") {
    return { ...base, slack: row.webhook_url ? { webhookUrl: row.webhook_url } : null };
  }
  return base;
}

export async function listChannels(db: Db, clientId: string, ids?: string[]): Promise<ChannelResponse[]> {
  const rows = await listClientChannels(db, clientId, ids);
  return rows.map(toResponse);
}

export async function getChannel(db: Db, clientId: string, channelId: string): Promise<ChannelResponse | null> {
  const row = await getClientChannel(db, clientId, channelId);
  return row ? toResponse(row) : null;
}
