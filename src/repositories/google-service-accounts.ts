import { and, eq } from "drizzle-orm";
import { google_service_accounts } from "../lib/schema.js";
import type { Db } from "../lib/db.js";
import { pgErrorCode } from "../lib/pg-errors.js";
import { ClientNotFoundError } from "./clients.js";

export interface GoogleServiceAccountRow {
  id: string;
  client_id: string;
  name: string | null;
  description: string | null;
  email: string;
  created_at: string;
  updated_at: string;
}

// Never selects key: the private key is write-only here. The places that need
// it (a site's ?include=googleServiceAccount, a Sheets integration) read it
// through their own queries.
const COLUMNS = {
  id: google_service_accounts.id,
  client_id: google_service_accounts.client_id,
  name: google_service_accounts.name,
  description: google_service_accounts.description,
  email: google_service_accounts.email,
  created_at: google_service_accounts.created_at,
  updated_at: google_service_accounts.updated_at,
};

// The client_id FK is the only one, so a 23503 means the client doesn't exist.
export async function insertGoogleServiceAccount(
  db: Db,
  data: { client_id: string; name: string; description: string | null; email: string; key: string }
): Promise<GoogleServiceAccountRow> {
  try {
    const rows = await db.insert(google_service_accounts).values(data).returning(COLUMNS);
    return rows[0];
  } catch (err: unknown) {
    if (pgErrorCode(err) === "23503") throw new ClientNotFoundError(data.client_id);
    throw err;
  }
}

export async function getClientGoogleServiceAccount(
  db: Db,
  clientId: string,
  id: string
): Promise<GoogleServiceAccountRow | null> {
  const rows = await db
    .select(COLUMNS)
    .from(google_service_accounts)
    .where(and(eq(google_service_accounts.id, id), eq(google_service_accounts.client_id, clientId)))
    .limit(1);
  return rows[0] ?? null;
}
