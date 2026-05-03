import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import type { Env } from "../types/index.js";

export const requireApiKey = createMiddleware<{ Bindings: Env }>(
  async (c, next) => {
    const key = c.req.header("X-API-Key");
    if (!key || key !== c.env.API_KEY) {
      throw new HTTPException(401, { message: "Unauthorized" });
    }
    await next();
  }
);
