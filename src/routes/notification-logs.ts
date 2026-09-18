import { Hono } from "hono";
import { createDb } from "../lib/db.js";
import { ForeignKeyError } from "../repositories/notification-logs.js";
import { createNotificationLog, listNotificationLogs, getNotificationLog } from "../services/notification-logs.js";
import type { AppEnv } from "../types/index.js";
import { notFoundResponse, validationErrorResponse } from "../lib/responses.js";
import { createNotificationLogSchema } from "../validators/notification-log.js";
import { logger } from "../lib/logger.js";

const notificationLogs = new Hono<AppEnv>();

notificationLogs.get("/", async (c) => {
  const { clientId, from, to, limit: limitParam } = c.req.query();

  const limit = limitParam !== undefined ? parseInt(limitParam, 10) : undefined;
  if (limit !== undefined && (isNaN(limit) || limit < 1)) {
    return validationErrorResponse(c, "limit must be a positive integer");
  }

  if (from && isNaN(Date.parse(from))) {
    return validationErrorResponse(c, "from must be a valid ISO 8601 date");
  }

  if (to && isNaN(Date.parse(to))) {
    return validationErrorResponse(c, "to must be a valid ISO 8601 date");
  }

  const db = createDb(c.env.DATABASE_URL);
  const rows = await listNotificationLogs(db, { clientId, from, to, limit });
  logger.info("listed notification logs", {
    requestId: c.get("requestId"),
    count: rows.length,
    clientId,
    from,
    to,
    limit,
  });
  return c.json({ success: true, data: rows });
});

notificationLogs.get("/:id", async (c) => {
  const id = parseInt(c.req.param("id"), 10);
  if (isNaN(id)) {
    return validationErrorResponse(c, "id must be a valid integer");
  }

  const db = createDb(c.env.DATABASE_URL);
  const log = await getNotificationLog(db, id);

  if (!log) {
    return notFoundResponse(c, `Notification log not found: ${id}`);
  }

  return c.json({ success: true, data: log });
});

notificationLogs.post("/", async (c) => {
  const body = await c.req.json().catch(() => null);
  const result = createNotificationLogSchema.safeParse(body);

  if (!result.success) {
    return validationErrorResponse(c, "Validation failed", result.error.issues);
  }

  try {
    const db = createDb(c.env.DATABASE_URL);
    const log = await createNotificationLog(db, result.data);
    logger.info("created notification log", {
      requestId: c.get("requestId"),
      logId: log.id,
      clientId: log.clientId,
      workflow: log.workflow,
      eventName: log.eventName,
      outcome: log.outcome,
    });
    return c.json({ success: true, data: log }, 201);
  } catch (err) {
    if (err instanceof ForeignKeyError) {
      return notFoundResponse(c, err.message);
    }
    throw err;
  }
});

export default notificationLogs;
