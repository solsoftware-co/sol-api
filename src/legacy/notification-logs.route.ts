// Frozen fork of today's live POST /v1/notification-logs contract
// (snake_case, no type/slack_webhook_url in the request). Exists so
// sol-notificaiton-service can move off /v1/notification-logs before that
// route is cut over to its new camelCase contract — see the SOL-7 plan's
// sequencing section. POST only: no caller was found for a GET list/by-id
// equivalent even on the current /v1 route, so none is forked here.
//
// Fully isolated: imports nothing from repositories/ or services/, and
// nothing outside legacy/ imports from this file.
import { Hono } from "hono";
import { createDb } from "../lib/db.js";
import { insertLegacyNotificationLog, ForeignKeyError } from "./notification-logs.repository.js";
import { ErrorCode, type AppEnv } from "../types/index.js";
import { createLegacyNotificationLogSchema } from "./notification-logs.validator.js";
import { logger } from "../lib/logger.js";

const legacyNotificationLogs = new Hono<AppEnv>();

legacyNotificationLogs.post("/", async (c) => {
  const body = await c.req.json().catch(() => null);
  const result = createLegacyNotificationLogSchema.safeParse(body);

  if (!result.success) {
    return c.json(
      {
        success: false,
        error: {
          code: ErrorCode.VALIDATION_ERROR,
          message: "Validation failed",
          details: result.error.issues,
        },
      },
      422
    );
  }

  try {
    const db = createDb(c.env.DATABASE_URL);
    const log = await insertLegacyNotificationLog(db, result.data);
    logger.info("created notification log (legacy)", {
      requestId: c.get("requestId"),
      logId: log.id,
      clientId: log.client_id,
      workflow: log.workflow,
      eventName: log.event_name,
      outcome: log.outcome,
    });
    return c.json({ success: true, data: log }, 201);
  } catch (err) {
    if (err instanceof ForeignKeyError) {
      return c.json(
        {
          success: false,
          error: {
            code: ErrorCode.NOT_FOUND,
            message: err.message,
            details: null,
          },
        },
        404
      );
    }
    throw err;
  }
});

export default legacyNotificationLogs;
