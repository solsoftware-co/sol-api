import { eq, and, asc, isNull, gt, or, sql } from "drizzle-orm";
import { form_api_keys } from "../lib/schema.js";
import type { Db } from "../lib/db.js";
import { pgErrorCode } from "../lib/pg-errors.js";
import { FormNotFoundError } from "./forms.js";

export { FormNotFoundError };

export interface FormApiKeyRow {
  id: string;
  name: string;
  key_prefix: string;
  created_at: string;
  revoked_at: string | null;
  expires_at: string | null;
}

// Never selects key_hash: no response ever contains a key's hash. Verifying
// a key compares hashes inside the database (findActiveFormApiKey).
const KEY_COLUMNS = {
  id: form_api_keys.id,
  name: form_api_keys.name,
  key_prefix: form_api_keys.key_prefix,
  created_at: form_api_keys.created_at,
  revoked_at: form_api_keys.revoked_at,
  expires_at: form_api_keys.expires_at,
};

// The composite FK (client_id, form_id) → forms is what rejects a form under
// the wrong client, so there's no separate existence check.
export async function insertFormApiKey(
  db: Db,
  data: {
    client_id: string;
    form_id: string;
    name: string;
    key_prefix: string;
    key_hash: string;
    expires_at: string | null;
  }
): Promise<FormApiKeyRow> {
  try {
    const rows = await db.insert(form_api_keys).values(data).returning(KEY_COLUMNS);
    return rows[0];
  } catch (err: unknown) {
    if (pgErrorCode(err) === "23503") throw new FormNotFoundError(data.form_id);
    throw err;
  }
}

// Every key, revoked and expired ones included, so the list shows the full
// history of a form's keys.
export async function listFormApiKeys(db: Db, clientId: string, formId: string): Promise<FormApiKeyRow[]> {
  return db
    .select(KEY_COLUMNS)
    .from(form_api_keys)
    .where(and(eq(form_api_keys.client_id, clientId), eq(form_api_keys.form_id, formId)))
    .orderBy(asc(form_api_keys.created_at), asc(form_api_keys.id));
}

// Idempotent: revoking an already-revoked key keeps its original revoked_at.
// Returns false when no such key exists under this client's form.
export async function revokeFormApiKey(db: Db, clientId: string, formId: string, keyId: string): Promise<boolean> {
  const rows = await db
    .update(form_api_keys)
    .set({ revoked_at: sql`COALESCE(${form_api_keys.revoked_at}, now())` })
    .where(
      and(
        eq(form_api_keys.id, keyId),
        eq(form_api_keys.client_id, clientId),
        eq(form_api_keys.form_id, formId)
      )
    )
    .returning({ id: form_api_keys.id });
  return rows.length > 0;
}

// The key (by its hash) if it's one of this client's form's active keys: not
// revoked, not expired (checked against the database clock). The lookup uses
// the UNIQUE key_hash index; the hash never leaves sol-api.
export async function findActiveFormApiKey(
  db: Db,
  clientId: string,
  formId: string,
  keyHash: string
): Promise<{ id: string } | null> {
  const rows = await db
    .select({ id: form_api_keys.id })
    .from(form_api_keys)
    .where(
      and(
        eq(form_api_keys.key_hash, keyHash),
        eq(form_api_keys.client_id, clientId),
        eq(form_api_keys.form_id, formId),
        isNull(form_api_keys.revoked_at),
        or(isNull(form_api_keys.expires_at), gt(form_api_keys.expires_at, sql`now()`))
      )
    )
    .limit(1);
  return rows[0] ?? null;
}
