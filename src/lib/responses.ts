import type { Context } from "hono";
import { ErrorCode, type AppEnv } from "../types/index.js";

// The NOT_FOUND envelope is identical everywhere it's used — only the
// message changes — so every route (including legacy/) builds it here
// instead of redefining the same {success, error: {code, message, details}}
// object inline.
export function notFoundResponse(c: Context<AppEnv>, message: string) {
  return c.json(
    { success: false as const, error: { code: ErrorCode.NOT_FOUND, message, details: null } },
    404
  );
}
