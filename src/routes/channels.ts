import { Hono } from "hono";
import { createDb } from "../lib/db.js";
import { isUuid } from "../lib/validation.js";
import {
  listChannels,
  getChannel,
  createChannel,
  ClientNotFoundError,
  ChannelNameTakenError,
} from "../services/channels.js";
import { conflictResponse, notFoundResponse, validationErrorResponse } from "../lib/responses.js";
import { createChannelSchema } from "../validators/channel.js";
import { logger } from "../lib/logger.js";
import type { AppEnv } from "../types/index.js";

const channels = new Hono<AppEnv>();

// Creates the channel with its email addresses or Slack webhook. Responds
// with what GET /channels/:id returns. Never logs addresses or the webhook.
channels.post("/:clientId/channels", async (c) => {
  const clientId = c.req.param("clientId");

  const body = await c.req.json().catch(() => null);
  const result = createChannelSchema.safeParse(body);
  if (!result.success) {
    return validationErrorResponse(c, "Validation failed", result.error.issues);
  }

  try {
    const db = createDb(c.env.DATABASE_URL);
    const created = await createChannel(db, clientId, result.data);
    logger.info("created channel", { clientId, channelId: created.id, type: created.type });
    return c.json({ success: true, data: created }, 201);
  } catch (err) {
    if (err instanceof ClientNotFoundError) return notFoundResponse(c, err.message);
    if (err instanceof ChannelNameTakenError) return conflictResponse(c, err.message);
    throw err;
  }
});

// ?ids=a,b resolves specific channels (unknown or other-client ids are simply
// absent from the result); without it, every channel the client has. Each
// carries what's needed to deliver to it — email addresses or Slack webhook.
channels.get("/:clientId/channels", async (c) => {
  const clientId = c.req.param("clientId");
  const idsParam = c.req.query("ids");

  let ids: string[] | undefined;
  if (idsParam !== undefined) {
    ids = idsParam.split(",").map((v) => v.trim()).filter(Boolean);
    const invalid = ids.filter((id) => !isUuid(id));
    if (invalid.length > 0) {
      return validationErrorResponse(c, "ids must be a comma-separated list of UUIDs", { invalid });
    }
  }

  const db = createDb(c.env.DATABASE_URL);
  const rows = ids && ids.length === 0 ? [] : await listChannels(db, clientId, ids);
  return c.json({ success: true, data: rows });
});

channels.get("/:clientId/channels/:channelId", async (c) => {
  const clientId = c.req.param("clientId");
  const channelId = c.req.param("channelId");
  const notFound = () => notFoundResponse(c, `Channel not found: ${channelId}`);

  if (!isUuid(channelId)) return notFound();

  const db = createDb(c.env.DATABASE_URL);
  const channel = await getChannel(db, clientId, channelId);
  if (!channel) return notFound();

  return c.json({ success: true, data: channel });
});

export default channels;
