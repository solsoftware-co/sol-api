import type { Db } from "../lib/db.js";
import {
  insertFormApiKey,
  listFormApiKeys as listFormApiKeysRepo,
  revokeFormApiKey as revokeFormApiKeyRepo,
  findActiveFormApiKey,
} from "../repositories/form-api-keys.js";
import { getClientForm } from "../repositories/forms.js";
import { generateApiKey, hashApiKey } from "../lib/api-keys.js";
import { snakeToCamelKeys } from "../lib/case.js";
import type { CreateFormApiKeyInput } from "../validators/form-api-key.js";

export { FormNotFoundError } from "../repositories/form-api-keys.js";

export interface FormApiKeyResponse {
  id: string;
  name: string;
  keyPrefix: string;
  createdAt: string;
  revokedAt: string | null;
  expiresAt: string | null;
}

/** The create response: the only response that ever contains the plaintext key. */
export interface CreatedFormApiKeyResponse {
  id: string;
  name: string;
  keyPrefix: string;
  key: string;
  createdAt: string;
  expiresAt: string | null;
}

export async function createFormApiKey(
  db: Db,
  clientId: string,
  formId: string,
  input: CreateFormApiKeyInput
): Promise<CreatedFormApiKeyResponse> {
  const { key, keyPrefix, keyHash } = await generateApiKey();
  const row = await insertFormApiKey(db, {
    client_id: clientId,
    form_id: formId,
    name: input.name,
    key_prefix: keyPrefix,
    key_hash: keyHash,
    expires_at: input.expiresAt ?? null,
  });
  return {
    id: row.id,
    name: row.name,
    keyPrefix: row.key_prefix,
    key,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  };
}

// null when the form doesn't exist under this client (→ 404), so another
// client's form isn't reported as a form with no keys.
export async function listFormApiKeys(db: Db, clientId: string, formId: string): Promise<FormApiKeyResponse[] | null> {
  const [form, rows] = await Promise.all([
    getClientForm(db, clientId, formId),
    listFormApiKeysRepo(db, clientId, formId),
  ]);
  if (!form) return null;
  return rows.map((row) => snakeToCamelKeys(row));
}

export async function revokeFormApiKey(db: Db, clientId: string, formId: string, keyId: string): Promise<boolean> {
  return revokeFormApiKeyRepo(db, clientId, formId, keyId);
}

export type VerifyFormApiKeyResponse = { authenticated: true; keyId: string } | { authenticated: false };

// Sol Gate's check of a caller's key: sol-api answers yes/no (plus which key
// matched, for Sol Gate's logs) and never returns key material. An unknown
// form, or another client's form, is just "not authenticated", so the
// endpoint doesn't reveal which forms exist.
export async function verifyFormApiKey(
  db: Db,
  clientId: string,
  formId: string,
  key: string
): Promise<VerifyFormApiKeyResponse> {
  const match = await findActiveFormApiKey(db, clientId, formId, await hashApiKey(key));
  return match ? { authenticated: true, keyId: match.id } : { authenticated: false };
}
