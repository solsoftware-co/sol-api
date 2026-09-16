import type { Db } from "../lib/db.js";
import { getSlackChannelById } from "../repositories/slack-channels.js";
import { snakeToCamelKeys } from "../lib/case.js";

export interface SlackChannelResponse {
  id: string;
  clientId: string;
  name: string;
  description: string | null;
  webhookUrl: string;
  createdAt: string;
  updatedAt: string;
}

export async function getSlackChannel(
  db: Db,
  clientId: string,
  channelId: string
): Promise<SlackChannelResponse | null> {
  const row = await getSlackChannelById(db, clientId, channelId);
  if (!row) return null;
  return snakeToCamelKeys(row);
}
