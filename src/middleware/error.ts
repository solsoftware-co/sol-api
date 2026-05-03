import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { ErrorCode } from "../types/index.js";

export function errorHandler(err: Error, c: Context): Response {
  if (err instanceof HTTPException) {
    const code = statusToErrorCode(err.status);
    return c.json(
      {
        success: false,
        error: { code, message: err.message, details: null },
      },
      err.status as Parameters<typeof c.json>[1]
    );
  }

  console.error("Unhandled error:", err);
  return c.json(
    {
      success: false,
      error: {
        code: ErrorCode.INTERNAL_ERROR,
        message: "An unexpected error occurred",
        details: null,
      },
    },
    500
  );
}

function statusToErrorCode(status: number): ErrorCode {
  switch (status) {
    case 401:
      return ErrorCode.UNAUTHORIZED;
    case 404:
      return ErrorCode.NOT_FOUND;
    case 409:
      return ErrorCode.CONFLICT;
    case 422:
      return ErrorCode.VALIDATION_ERROR;
    case 503:
      return ErrorCode.SERVICE_UNAVAILABLE;
    default:
      return ErrorCode.INTERNAL_ERROR;
  }
}
