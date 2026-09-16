import type { Db } from "../lib/db.js";
import { getSlackChannelById } from "../repositories/slack-channels.js";
import { snakeToCamelKeys } from "../lib/case.js";
import type { SlackChannelResponse } from "../types/slack-channels.js";

export async function getSlackChannel(
  db: Db,
  clientId: string,
  channelId: string
): Promise<SlackChannelResponse | null> {
  const row = await getSlackChannelById(db, clientId, channelId);
  if (!row) return null;
  return snakeToCamelKeys(row) as unknown as SlackChannelResponse;
}
