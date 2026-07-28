import { Hono } from "hono";
import { createDb, healthCheck } from "../lib/db.js";
import { ErrorCode, type AppEnv } from "../types/index.js";
import { logger } from "../lib/logger.js";

const health = new Hono<AppEnv>();

health.get("/", async (c) => {
  try {
    const db = createDb(c.env.DATABASE_URL);
    await healthCheck(db);
    return c.json({
      success: true,
      data: {
        status: "ok",
        database: "connected",
        environment: c.env.ENVIRONMENT,
      },
    });
  } catch (err) {
    logger.warn("health check failed: database unreachable", {
      requestId: c.get("requestId"),
      environment: c.env.ENVIRONMENT,
      errorMessage: err instanceof Error ? err.message : String(err),
    });
    return c.json(
      {
        success: false,
        error: {
          code: ErrorCode.SERVICE_UNAVAILABLE,
          message: "Database connection failed",
          details: err instanceof Error ? err.message : String(err),
        },
      },
      503
    );
  }
});

export default health;
