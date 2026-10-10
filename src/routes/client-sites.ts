import { Hono } from "hono";
import { createDb } from "../lib/db.js";
import { isUuid } from "../lib/validation.js";
import { getSite, createSite, ClientNotFoundError, InvalidReferencesError } from "../services/sites.js";
import { notFoundResponse, validationErrorResponse } from "../lib/responses.js";
import { createSiteSchema } from "../validators/site.js";
import { logger } from "../lib/logger.js";
import type { AppEnv } from "../types/index.js";

const clientSites = new Hono<AppEnv>();

// Creates the site with its Sanity config and GitHub repo, if given. Responds
// with what GET /sites/:id returns (no service account key).
clientSites.post("/:clientId/sites", async (c) => {
  const clientId = c.req.param("clientId");

  const body = await c.req.json().catch(() => null);
  const result = createSiteSchema.safeParse(body);
  if (!result.success) {
    return validationErrorResponse(c, "Validation failed", result.error.issues);
  }

  try {
    const db = createDb(c.env.DATABASE_URL);
    const created = await createSite(db, clientId, result.data);
    logger.info("created site", { clientId, siteId: created.id });
    return c.json({ success: true, data: created }, 201);
  } catch (err) {
    if (err instanceof ClientNotFoundError) return notFoundResponse(c, err.message);
    if (err instanceof InvalidReferencesError) return validationErrorResponse(c, err.message, err.details);
    throw err;
  }
});

clientSites.get("/:clientId/sites/:siteId", async (c) => {
  const clientId = c.req.param("clientId");
  const siteId = c.req.param("siteId");
  const notFound = () => notFoundResponse(c, `Site not found: ${siteId}`);

  if (!isUuid(siteId)) return notFound();

  const include = new Set(
    (c.req.query("include") ?? "").split(",").map((v) => v.trim()).filter(Boolean)
  );

  const db = createDb(c.env.DATABASE_URL);
  const site = await getSite(db, clientId, siteId, include.has("googleServiceAccount"));
  if (!site) return notFound();

  return c.json({ success: true, data: site });
});

export default clientSites;
