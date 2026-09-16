import { Hono } from "hono";
import { createDb } from "../lib/db.js";
import { listSites, parseSitesQuery, InvalidBooleanParamError } from "../services/sites.js";
import { ErrorCode, type AppEnv } from "../types/index.js";

const sites = new Hono<AppEnv>();

sites.get("/", async (c) => {
  let opts;
  try {
    opts = parseSitesQuery({
      active: c.req.query("active"),
      analyticsReportEnabled: c.req.query("analyticsReportEnabled"),
    });
  } catch (err) {
    if (err instanceof InvalidBooleanParamError) {
      return c.json(
        {
          success: false,
          error: { code: ErrorCode.VALIDATION_ERROR, message: err.message, details: null },
        },
        422
      );
    }
    throw err;
  }

  const db = createDb(c.env.DATABASE_URL);
  const rows = await listSites(db, opts);
  return c.json({ success: true, data: rows });
});

export default sites;
