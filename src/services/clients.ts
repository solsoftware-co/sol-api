import type { Db } from "../lib/db.js";
import { getClientMinimal } from "../repositories/clients.js";
import { snakeToCamelKeys } from "../lib/case.js";
import type { ClientMinimalResponse } from "../types/clients.js";

export async function getClient(db: Db, id: string): Promise<ClientMinimalResponse | null> {
  const row = await getClientMinimal(db, id);
  if (!row) return null;
  return snakeToCamelKeys(row) as unknown as ClientMinimalResponse;
}
