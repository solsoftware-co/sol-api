import { Hono } from "hono";
import { createDb } from "../lib/db.js";
import { getClient } from "../services/clients.js";
import { ErrorCode, type AppEnv } from "../types/index.js";

const clients = new Hono<AppEnv>();

clients.get("/:clientId", async (c) => {
  const db = createDb(c.env.DATABASE_URL);
  const clientId = c.req.param("clientId");
  const client = await getClient(db, clientId);

  if (!client) {
    return c.json(
      {
        success: false,
        error: {
          code: ErrorCode.NOT_FOUND,
          message: `Client not found: ${clientId}`,
          details: null,
        },
      },
      404
    );
  }

  return c.json({ success: true, data: client });
});

export default clients;
