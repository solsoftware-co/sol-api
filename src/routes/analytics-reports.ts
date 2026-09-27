import { Hono } from "hono";
import { createDb } from "../lib/db.js";
import { listAnalyticsReports, parseAnalyticsReportsQuery } from "../services/analytics-reports.js";
import { InvalidBooleanParamError } from "../lib/query-params.js";
import { validationErrorResponse } from "../lib/responses.js";
import type { AppEnv } from "../types/index.js";

const analyticsReports = new Hono<AppEnv>();

analyticsReports.get("/", async (c) => {
  let opts;
  try {
    opts = parseAnalyticsReportsQuery({ enabled: c.req.query("enabled"), active: c.req.query("active") });
  } catch (err) {
    if (err instanceof InvalidBooleanParamError) {
      return validationErrorResponse(c, err.message);
    }
    throw err;
  }

  const db = createDb(c.env.DATABASE_URL);
  const rows = await listAnalyticsReports(db, opts);
  return c.json({ success: true, data: rows });
});

export default analyticsReports;
