import { Hono } from "hono";
import { createDb, healthCheck } from "../lib/db.js";
import { ErrorCode, type Env } from "../types/index.js";

const health = new Hono<{ Bindings: Env }>();

health.get("/", async (c) => {
  try {
    const sql = createDb(c.env.DATABASE_URL);
    await healthCheck(sql);
    return c.json({
      success: true,
      data: {
        status: "ok",
        database: "connected",
        environment: c.env.ENVIRONMENT,
      },
    });
  } catch (err) {
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
