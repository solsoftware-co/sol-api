import { createMiddleware } from "hono/factory";
import type { AppEnv } from "../types/index.js";
import { logger } from "../lib/logger.js";

export const requestLogger = createMiddleware<AppEnv>(async (c, next) => {
  const requestId = crypto.randomUUID();
  c.set("requestId", requestId);

  const start = Date.now();
  await next();
  const durationMs = Date.now() - start;

  c.res.headers.set("X-Request-Id", requestId);
  logger.info("request completed", {
    requestId,
    method: c.req.method,
    path: c.req.path,
    status: c.res.status,
    durationMs,
  });
});
