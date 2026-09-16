import { Hono } from "hono";
import { createDb } from "../lib/db.js";
import { getClient } from "../services/clients.js";
import { notFoundResponse } from "../lib/responses.js";
import type { AppEnv } from "../types/index.js";

const clients = new Hono<AppEnv>();

clients.get("/:clientId", async (c) => {
  const db = createDb(c.env.DATABASE_URL);
  const clientId = c.req.param("clientId");
  const client = await getClient(db, clientId);

  if (!client) {
    return notFoundResponse(c, `Client not found: ${clientId}`);
  }

  return c.json({ success: true, data: client });
});

export default clients;
