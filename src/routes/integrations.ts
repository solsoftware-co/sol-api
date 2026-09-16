import { Hono } from "hono";
import { createDb } from "../lib/db.js";
import { isUuid } from "../lib/validation.js";
import { getIntegration } from "../services/integrations.js";
import { ErrorCode, type AppEnv } from "../types/index.js";

const integrations = new Hono<AppEnv>();

integrations.get("/:clientId/integrations/:integrationId", async (c) => {
  const clientId = c.req.param("clientId");
  const integrationId = c.req.param("integrationId");

  const notFound = () =>
    c.json(
      {
        success: false,
        error: {
          code: ErrorCode.NOT_FOUND,
          message: `Integration not found: ${integrationId}`,
          details: null,
        },
      },
      404
    );

  if (!isUuid(integrationId)) return notFound();

  const db = createDb(c.env.DATABASE_URL);
  const integration = await getIntegration(db, clientId, integrationId);
  if (!integration) return notFound();

  return c.json({ success: true, data: integration });
});

export default integrations;
