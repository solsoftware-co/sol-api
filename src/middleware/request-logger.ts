import { createMiddleware } from "hono/factory";
import type { AppEnv } from "../types/index.js";
import { logger } from "../lib/logger.js";
import { SUBMISSION_ID_HEADER, TRACE_ID_HEADER, idFromHeader, withLogScope } from "../lib/log-context.js";

export const requestLogger = createMiddleware<AppEnv>(async (c, next) => {
  // The caller's trace (Sol Gate's, forwarded by sol-integrate / sol-notify
  // too), or a new one; and Sol Gate's submissionId when the request is for a
  // submission — never made up here. Both go on every log line of the
  // request, with the environment (SOL-46). The traceId is returned as
  // X-Trace-Id.
  const traceId = idFromHeader(c.req.header(TRACE_ID_HEADER)) ?? crypto.randomUUID();
  const submissionId = idFromHeader(c.req.header(SUBMISSION_ID_HEADER));

  await withLogScope({ environment: c.env.ENVIRONMENT, traceId, submissionId }, async () => {
    const start = Date.now();
    await next();
    const durationMs = Date.now() - start;

    c.res.headers.set(TRACE_ID_HEADER, traceId);

    const cf = (c.req.raw as Request & { cf?: { colo?: string; country?: string } })
      .cf;

    logger.info("request completed", {
      method: c.req.method,
      path: c.req.path,
      query: c.req.query(),
      status: c.res.status,
      durationMs,
      userAgent: c.req.header("User-Agent"),
      colo: cf?.colo,
      country: cf?.country,
    });
  });
});
