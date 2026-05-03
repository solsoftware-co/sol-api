import { neon } from "@neondatabase/serverless";
import type { ClientRecord, ClientSummary } from "../types/index.js";

export type Sql = ReturnType<typeof neon>;

export function createDb(url: string): Sql {
  return neon(url);
}

export async function healthCheck(sql: Sql): Promise<void> {
  await sql`SELECT 1`;
}

export async function getClientById(
  sql: Sql,
  id: string
): Promise<ClientRecord | null> {
  const rows = await sql`
    SELECT
      id, name, email, ga4_property_id, active, settings,
      timezone, google_service_account_email, google_service_account_key,
      created_at
    FROM clients
    WHERE id = ${id} AND active = TRUE
  `;
  return (rows[0] as ClientRecord) ?? null;
}

export async function listClients(
  sql: Sql,
  opts: { limit?: number } = {}
): Promise<ClientSummary[]> {
  const rows =
    opts.limit !== undefined
      ? await sql`
          SELECT
            id, name, email, ga4_property_id, active, settings,
            timezone, google_service_account_email, created_at
          FROM clients
          WHERE active = TRUE
          LIMIT ${opts.limit}
        `
      : await sql`
          SELECT
            id, name, email, ga4_property_id, active, settings,
            timezone, google_service_account_email, created_at
          FROM clients
          WHERE active = TRUE
        `;
  return rows as ClientSummary[];
}

export class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConflictError";
  }
}

export async function insertClient(
  sql: Sql,
  data: {
    id: string;
    name: string;
    email: string;
    ga4_property_id?: string | null;
    timezone?: string;
    settings?: Record<string, unknown>;
    google_service_account_email?: string | null;
    google_service_account_key?: string | null;
  }
): Promise<ClientRecord> {
  try {
    const rows = await sql`
      INSERT INTO clients (
        id, name, email, ga4_property_id, timezone, settings,
        google_service_account_email, google_service_account_key
      )
      VALUES (
        ${data.id},
        ${data.name},
        ${data.email},
        ${data.ga4_property_id ?? null},
        ${data.timezone ?? "America/Chicago"},
        ${JSON.stringify(data.settings ?? {})},
        ${data.google_service_account_email ?? null},
        ${data.google_service_account_key ?? null}
      )
      RETURNING
        id, name, email, ga4_property_id, active, settings,
        timezone, google_service_account_email, google_service_account_key,
        created_at
    `;
    return rows[0] as ClientRecord;
  } catch (err: unknown) {
    if (
      err &&
      typeof err === "object" &&
      "code" in err &&
      (err as { code: string }).code === "23505"
    ) {
      throw new ConflictError(`Client already exists: ${data.id}`);
    }
    throw err;
  }
}

const UPDATABLE_COLUMNS = new Set([
  "name",
  "email",
  "ga4_property_id",
  "active",
  "timezone",
  "settings",
  "google_service_account_email",
  "google_service_account_key",
]);

export async function updateClient(
  sql: Sql,
  id: string,
  data: Record<string, unknown>
): Promise<ClientRecord | null> {
  const entries = Object.entries(data).filter(
    ([key, val]) => UPDATABLE_COLUMNS.has(key) && val !== undefined
  );
  if (entries.length === 0) return null;

  const keys = entries.map(([k]) => k);
  const values = entries.map(([, v]) => v);

  const setClauses = keys.map((k, i) => `${k} = $${i + 2}`).join(", ");

  const rows = await sql(
    `UPDATE clients SET ${setClauses} WHERE id = $1
     RETURNING id, name, email, ga4_property_id, active, settings,
               timezone, google_service_account_email, google_service_account_key, created_at`,
    [id, ...values]
  );

  return (rows[0] as ClientRecord) ?? null;
}
