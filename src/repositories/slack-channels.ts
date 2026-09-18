import { eq, and } from "drizzle-orm";
import { slack_channels } from "../lib/schema.js";
import type { Db } from "../lib/db.js";

export interface SlackChannelRow {
  id: string;
  client_id: string;
  name: string;
  description: string | null;
  webhook_url: string;
  created_at: string;
  updated_at: string;
}

export async function getSlackChannelById(
  db: Db,
  clientId: string,
  channelId: string
): Promise<SlackChannelRow | null> {
  const rows = await db
    .select({
      id: slack_channels.id,
      client_id: slack_channels.client_id,
      name: slack_channels.name,
      description: slack_channels.description,
      webhook_url: slack_channels.webhook_url,
      created_at: slack_channels.created_at,
      updated_at: slack_channels.updated_at,
    })
    .from(slack_channels)
    .where(and(eq(slack_channels.id, channelId), eq(slack_channels.client_id, clientId)))
    .limit(1);
  return rows[0] ?? null;
}
