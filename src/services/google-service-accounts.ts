import type { Db } from "../lib/db.js";
import {
  insertGoogleServiceAccount,
  getClientGoogleServiceAccount,
  type GoogleServiceAccountRow,
} from "../repositories/google-service-accounts.js";
import { snakeToCamelKeys } from "../lib/case.js";
import type { CreateGoogleServiceAccountInput } from "../validators/google-service-account.js";

export { ClientNotFoundError } from "../repositories/clients.js";

/** A service account without its private key — no response here contains it. */
export interface GoogleServiceAccountResponse {
  id: string;
  clientId: string;
  name: string | null;
  description: string | null;
  email: string;
  createdAt: string;
  updatedAt: string;
}

function toResponse(row: GoogleServiceAccountRow): GoogleServiceAccountResponse {
  return snakeToCamelKeys(row);
}

export async function createGoogleServiceAccount(
  db: Db,
  clientId: string,
  input: CreateGoogleServiceAccountInput
): Promise<GoogleServiceAccountResponse> {
  const row = await insertGoogleServiceAccount(db, {
    client_id: clientId,
    name: input.name,
    description: input.description ?? null,
    email: input.email,
    key: input.key,
  });
  return toResponse(row);
}

export async function getGoogleServiceAccount(
  db: Db,
  clientId: string,
  id: string
): Promise<GoogleServiceAccountResponse | null> {
  const row = await getClientGoogleServiceAccount(db, clientId, id);
  return row ? toResponse(row) : null;
}
