import { and, eq, inArray } from "drizzle-orm";
import { channels, google_service_accounts, integrations, sites } from "../lib/schema.js";
import type { Db } from "../lib/db.js";
import { isUuid } from "../lib/validation.js";

// The tables a create's body can reference by id. Each has id + client_id.
export type ClientScopedTable = typeof channels | typeof google_service_accounts | typeof integrations | typeof sites;

// The ids from a request body that aren't this client's rows in `table`, in
// the order given, without duplicates. An id that doesn't exist and an id that
// belongs to another client come back the same way — one query scoped to the
// client can't tell them apart, so a response built from this never reveals
// that a record exists under another client. Run before a create's inserts to
// name the bad ids in a 422; the composite FKs remain the actual guarantee.
export async function findMissingIds(
  db: Db,
  table: ClientScopedTable,
  clientId: string,
  ids: string[]
): Promise<string[]> {
  const unique = [...new Set(ids)];
  // A non-UUID can't match a uuid column, and would make Postgres reject the query.
  const candidates = unique.filter(isUuid);
  if (candidates.length === 0) return unique;

  const rows: { id: string }[] = await db
    .select({ id: table.id })
    .from(table)
    .where(and(eq(table.client_id, clientId), inArray(table.id, candidates)));
  // Postgres returns uuids lowercase; a caller may have sent them uppercase.
  const found = new Set(rows.map((r) => r.id.toLowerCase()));
  return unique.filter((id) => !found.has(id.toLowerCase()));
}

// A create's body referenced ids that aren't this client's: a 422 whose
// details name them per body field, e.g. { googleServiceAccountId: ["…"] }.
// Thrown both by the pre-check and when a same-client FK fails in a race, so
// the two paths produce the identical response.
export class InvalidReferencesError extends Error {
  constructor(
    public readonly details: Record<string, string[]>,
    message = "Referenced records not found for this client"
  ) {
    super(message);
    this.name = "InvalidReferencesError";
  }
}
