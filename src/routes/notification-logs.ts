import { Hono } from "hono";
import {
  createDb,
  listNotificationLogs,
  getNotificationLogById,
  insertNotificationLog,
  ForeignKeyError,
} from "../lib/db.js";
import { ErrorCode, type Env } from "../types/index.js";
import { createNotificationLogSchema } from "../validators/notification-log.js";

const notificationLogs = new Hono<{ Bindings: Env }>();

notificationLogs.get("/", async (c) => {
  const { client_id, from, to, limit: limitParam } = c.req.query();

  const limit = limitParam !== undefined ? parseInt(limitParam, 10) : undefined;
  if (limit !== undefined && (isNaN(limit) || limit < 1)) {
    return c.json(
      {
        success: false,
        error: {
          code: ErrorCode.VALIDATION_ERROR,
          message: "limit must be a positive integer",
          details: null,
        },
      },
      422
    );
  }

  if (from && isNaN(Date.parse(from))) {
    return c.json(
      {
        success: false,
        error: {
          code: ErrorCode.VALIDATION_ERROR,
          message: "from must be a valid ISO 8601 date",
          details: null,
        },
      },
      422
    );
  }

  if (to && isNaN(Date.parse(to))) {
    return c.json(
      {
        success: false,
        error: {
          code: ErrorCode.VALIDATION_ERROR,
          message: "to must be a valid ISO 8601 date",
          details: null,
        },
      },
      422
    );
  }

  const db = createDb(c.env.DATABASE_URL);
  const rows = await listNotificationLogs(db, { client_id, from, to, limit });
  return c.json({ success: true, data: rows });
});

notificationLogs.get("/:id", async (c) => {
  const id = parseInt(c.req.param("id"), 10);
  if (isNaN(id)) {
    return c.json(
      {
        success: false,
        error: {
          code: ErrorCode.VALIDATION_ERROR,
          message: "id must be a valid integer",
          details: null,
        },
      },
      422
    );
  }

  const db = createDb(c.env.DATABASE_URL);
  const log = await getNotificationLogById(db, id);

  if (!log) {
    return c.json(
      {
        success: false,
        error: {
          code: ErrorCode.NOT_FOUND,
          message: `Notification log not found: ${id}`,
          details: null,
        },
      },
      404
    );
  }

  return c.json({ success: true, data: log });
});

notificationLogs.post("/", async (c) => {
  const body = await c.req.json().catch(() => null);
  const result = createNotificationLogSchema.safeParse(body);

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
    const log = await insertNotificationLog(db, result.data);
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

export default notificationLogs;
