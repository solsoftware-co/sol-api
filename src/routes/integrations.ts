import { Hono } from "hono";
import { createDb } from "../lib/db.js";
import { isUuid } from "../lib/validation.js";
import {
  getIntegration,
  createIntegration,
  ClientNotFoundError,
  InvalidReferencesError,
} from "../services/integrations.js";
import { notFoundResponse, validationErrorResponse } from "../lib/responses.js";
import { createIntegrationSchema } from "../validators/integration.js";
import { logger } from "../lib/logger.js";
import type { AppEnv } from "../types/index.js";

const integrations = new Hono<AppEnv>();

// Creates the integration with its Mailchimp or Google Sheets configuration.
// Responds with what GET /integrations/:id returns. Never logs credentials.
integrations.post("/:clientId/integrations", async (c) => {
  const clientId = c.req.param("clientId");

  const body = await c.req.json().catch(() => null);
  const result = createIntegrationSchema.safeParse(body);
  if (!result.success) {
    return validationErrorResponse(c, "Validation failed", result.error.issues);
  }

  try {
    const db = createDb(c.env.DATABASE_URL);
    const created = await createIntegration(db, clientId, result.data);
    logger.info("created integration", { clientId, integrationId: created.id, type: created.type });
    return c.json({ success: true, data: created }, 201);
  } catch (err) {
    if (err instanceof ClientNotFoundError) return notFoundResponse(c, err.message);
    if (err instanceof InvalidReferencesError) return validationErrorResponse(c, err.message, err.details);
    throw err;
  }
});

integrations.get("/:clientId/integrations/:integrationId", async (c) => {
  const clientId = c.req.param("clientId");
  const integrationId = c.req.param("integrationId");
  const notFound = () => notFoundResponse(c, `Integration not found: ${integrationId}`);

  if (!isUuid(integrationId)) return notFound();

  const db = createDb(c.env.DATABASE_URL);
  const integration = await getIntegration(db, clientId, integrationId);
  if (!integration) return notFound();

  return c.json({ success: true, data: integration });
});

export default integrations;
