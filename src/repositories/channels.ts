import { eq, and, asc, inArray } from "drizzle-orm";
import { channels, email_groups, slack_channels, type ChannelType } from "../lib/schema.js";
import type { Db } from "../lib/db.js";
import { pgErrorCode } from "../lib/pg-errors.js";
import { ClientNotFoundError } from "./clients.js";

export class ChannelNameTakenError extends Error {
  constructor(name: string) {
    super(`A channel named "${name}" already exists for this client`);
    this.name = "ChannelNameTakenError";
  }
}

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

export type NewChannel =
  | { client_id: string; type: "email"; name: string; description: string | null; email_addresses: string[] }
  | { client_id: string; type: "slack"; name: string; description: string | null; webhook_url: string };

// The channel and its type-specific half are written in one db.batch — one
// transaction over neon-http — so a failure leaves neither behind. The id is
// generated here rather than by the database so both inserts are known up
// front. channels_client_id_fkey is the only FK that can fail (the subtype
// row references the channel created in the same batch), so a 23503 means
// the client doesn't exist; the unique (client_id, name) is the only 23505.
export async function insertChannel(db: Db, data: NewChannel): Promise<string> {
  const id = crypto.randomUUID();
  const channel = db.insert(channels).values({
    id,
    client_id: data.client_id,
    type: data.type,
    name: data.name,
    description: data.description,
  });
  const subtype =
    data.type === "email"
      ? db.insert(email_groups).values({ channel_id: id, email_addresses: data.email_addresses })
      : db.insert(slack_channels).values({ channel_id: id, webhook_url: data.webhook_url });

  try {
    await db.batch([channel, subtype]);
    return id;
  } catch (err: unknown) {
    const code = pgErrorCode(err);
    if (code === "23503") throw new ClientNotFoundError(data.client_id);
    if (code === "23505") throw new ChannelNameTakenError(data.name);
    throw err;
  }
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
