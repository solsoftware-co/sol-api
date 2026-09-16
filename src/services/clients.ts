import type { Db } from "../lib/db.js";
import { getClientMinimal } from "../repositories/clients.js";
import { snakeToCamelKeys } from "../lib/case.js";

export interface ClientMinimalResponse {
  id: string;
  name: string;
  email: string;
  active: boolean;
  settings: Record<string, unknown>;
  timezone: string;
  createdAt: string;
}

export async function getClient(db: Db, id: string): Promise<ClientMinimalResponse | null> {
  const row = await getClientMinimal(db, id);
  if (!row) return null;
  return snakeToCamelKeys(row) as unknown as ClientMinimalResponse;
}
