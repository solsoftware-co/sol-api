import { Hono } from "hono";
import { createDb } from "../lib/db.js";
import { isUuid } from "../lib/validation.js";
import { getSlackChannel } from "../services/slack-channels.js";
import { notFoundResponse } from "../lib/responses.js";
import type { AppEnv } from "../types/index.js";

const slackChannels = new Hono<AppEnv>();

slackChannels.get("/:clientId/slack-channels/:channelId", async (c) => {
  const clientId = c.req.param("clientId");
  const channelId = c.req.param("channelId");
  const notFound = () => notFoundResponse(c, `Slack channel not found: ${channelId}`);

  if (!isUuid(channelId)) return notFound();

  const db = createDb(c.env.DATABASE_URL);
  const channel = await getSlackChannel(db, clientId, channelId);
  if (!channel) return notFound();

  return c.json({ success: true, data: channel });
});

export default slackChannels;
