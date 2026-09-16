import { Hono } from "hono";
import { createDb } from "../lib/db.js";
import { isUuid } from "../lib/validation.js";
import { getSite } from "../services/sites.js";
import { ErrorCode, type AppEnv } from "../types/index.js";

const clientSites = new Hono<AppEnv>();

clientSites.get("/:clientId/sites/:siteId", async (c) => {
  const clientId = c.req.param("clientId");
  const siteId = c.req.param("siteId");

  const notFound = () =>
    c.json(
      {
        success: false,
        error: { code: ErrorCode.NOT_FOUND, message: `Site not found: ${siteId}`, details: null },
      },
      404
    );

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
