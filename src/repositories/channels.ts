import { eq, and, asc, inArray } from "drizzle-orm";
import { channels, email_groups, slack_channels, type ChannelType } from "../lib/schema.js";
import type { Db } from "../lib/db.js";

export interface ChannelRow {
  id: string;
  client_id: string;
  type: ChannelType;
  name: string;
  description: string | null;
  email_addresses: string[] | null;
  webhook_url: string | null;
  created_at: string;
  updated_at: string;
}

// Each channel's type-specific half is left-joined, so one query returns
// everything needed to deliver to it: email addresses or the Slack webhook.
// The webhook is returned like an integration's credentials are — any caller
// here already holds the API key.
const CHANNEL_COLUMNS = {
  id: channels.id,
  client_id: channels.client_id,
  type: channels.type,
  name: channels.name,
  description: channels.description,
  email_addresses: email_groups.email_addresses,
  webhook_url: slack_channels.webhook_url,
  created_at: channels.created_at,
  updated_at: channels.updated_at,
};

export async function listClientChannels(db: Db, clientId: string, ids?: string[]): Promise<ChannelRow[]> {
  const conditions = [eq(channels.client_id, clientId)];
  if (ids) conditions.push(inArray(channels.id, ids));
  return db
    .select(CHANNEL_COLUMNS)
    .from(channels)
    .leftJoin(email_groups, eq(email_groups.channel_id, channels.id))
    .leftJoin(slack_channels, eq(slack_channels.channel_id, channels.id))
    .where(and(...conditions))
    .orderBy(asc(channels.name));
}

export async function getClientChannel(db: Db, clientId: string, channelId: string): Promise<ChannelRow | null> {
  const rows = await db
    .select(CHANNEL_COLUMNS)
    .from(channels)
    .leftJoin(email_groups, eq(email_groups.channel_id, channels.id))
    .leftJoin(slack_channels, eq(slack_channels.channel_id, channels.id))
    .where(and(eq(channels.id, channelId), eq(channels.client_id, clientId)))
    .limit(1);
  return rows[0] ?? null;
}
