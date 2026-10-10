import { Hono } from "hono";
import { createDb } from "../lib/db.js";
import { isUuid } from "../lib/validation.js";
import {
  createAnalyticsReport,
  getAnalyticsReport,
  ClientNotFoundError,
  InvalidReferencesError,
} from "../services/analytics-reports.js";
import { notFoundResponse, validationErrorResponse } from "../lib/responses.js";
import { createAnalyticsReportSchema } from "../validators/analytics-report.js";
import { logger } from "../lib/logger.js";
import type { AppEnv } from "../types/index.js";

// A client's analytics reports (SOL-52). The scheduler's fleet-wide list stays
// at GET /v1/analytics-reports.
const clientAnalyticsReports = new Hono<AppEnv>();

clientAnalyticsReports.post("/:clientId/analytics-reports", async (c) => {
  const clientId = c.req.param("clientId");

  const body = await c.req.json().catch(() => null);
  const result = createAnalyticsReportSchema.safeParse(body);
  if (!result.success) {
    return validationErrorResponse(c, "Validation failed", result.error.issues);
  }

  try {
    const db = createDb(c.env.DATABASE_URL);
    const created = await createAnalyticsReport(db, clientId, result.data);
    logger.info("created analytics report", { clientId, analyticsReportId: created.id, siteId: created.siteId });
    return c.json({ success: true, data: created }, 201);
  } catch (err) {
    if (err instanceof ClientNotFoundError) return notFoundResponse(c, err.message);
    if (err instanceof InvalidReferencesError) return validationErrorResponse(c, err.message, err.details);
    throw err;
  }
});

// Client-scoped like every other by-id lookup: another client's report is a 404.
clientAnalyticsReports.get("/:clientId/analytics-reports/:reportId", async (c) => {
  const clientId = c.req.param("clientId");
  const reportId = c.req.param("reportId");
  const notFound = () => notFoundResponse(c, `Analytics report not found: ${reportId}`);

  if (!isUuid(reportId)) return notFound();

  const db = createDb(c.env.DATABASE_URL);
  const report = await getAnalyticsReport(db, clientId, reportId);
  if (!report) return notFound();

  return c.json({ success: true, data: report });
});

export default clientAnalyticsReports;
