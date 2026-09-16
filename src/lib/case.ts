// Shallow, top-level-only key rename. Deliberately does not recurse: several
// tables have opaque JSONB blobs (clients.settings, notification_logs.metadata)
// whose internal keys must never be silently rewritten. Callers that need a
// nested piece camelCased call this again on that piece explicitly.
export function snakeToCamelKeys<T extends object>(obj: T): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    const camelKey = key.replace(/_([a-zA-Z0-9])/g, (_, c: string) => c.toUpperCase());
    result[camelKey] = value;
  }
  return result;
}
