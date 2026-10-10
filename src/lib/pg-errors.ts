// Generic Postgres error-code extraction — infra, not business logic, so it's
// shared by both repositories/ and legacy/ without crossing the isolation
// boundary the way a resource-shaped query or error class would.
export function pgErrorCode(err: unknown): string | undefined {
  if (!err || typeof err !== "object") return undefined;
  if ("code" in err && typeof (err as { code: unknown }).code === "string") {
    return (err as { code: string }).code;
  }
  const cause = (err as { cause?: unknown }).cause;
  if (
    cause &&
    typeof cause === "object" &&
    "code" in cause &&
    typeof (cause as { code: unknown }).code === "string"
  ) {
    return (cause as { code: string }).code;
  }
  return undefined;
}

// The violated constraint's name (e.g. "integrations_client_id_fkey"), for
// telling apart which FK failed when one insert has several. Same lookup as
// pgErrorCode: on the error itself, or on the driver error drizzle wraps.
export function pgErrorConstraint(err: unknown): string | undefined {
  if (!err || typeof err !== "object") return undefined;
  if ("constraint" in err && typeof (err as { constraint: unknown }).constraint === "string") {
    return (err as { constraint: string }).constraint;
  }
  const cause = (err as { cause?: unknown }).cause;
  if (
    cause &&
    typeof cause === "object" &&
    "constraint" in cause &&
    typeof (cause as { constraint: unknown }).constraint === "string"
  ) {
    return (cause as { constraint: string }).constraint;
  }
  return undefined;
}
