type CamelCase<S extends string> = S extends `${infer Head}_${infer Tail}`
  ? `${Head}${Capitalize<CamelCase<Tail>>}`
  : S;

type CamelCaseKeys<T> = { [K in keyof T as CamelCase<K & string>]: T[K] };

// Shallow, top-level-only key rename. Deliberately does not recurse: several
// tables have opaque JSONB blobs (clients.settings, notification_logs.metadata)
// whose internal keys must never be silently rewritten. Callers that need a
// nested piece camelCased call this again on that piece explicitly.
//
// The return type is computed from the input type (CamelCaseKeys<T>) so
// callers get a precisely-typed result instead of a generic
// Record<string, unknown> — no `as unknown as SomeResponse` needed at every
// call site. The one cast this requires lives here, checked once against
// the actual renaming logic below, instead of being repeated (and only
// ever eyeballed, never verified) at each caller.
export function snakeToCamelKeys<T extends object>(obj: T): CamelCaseKeys<T> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    const camelKey = key.replace(/_([a-zA-Z0-9])/g, (_, c: string) => c.toUpperCase());
    result[camelKey] = value;
  }
  return result as CamelCaseKeys<T>;
}
