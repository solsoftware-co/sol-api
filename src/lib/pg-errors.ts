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
