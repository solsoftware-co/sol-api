import { eq, and } from "drizzle-orm";
import { clients } from "../lib/schema.js";
import type { Db } from "../lib/db.js";

export interface ClientMinimalRow {
  id: string;
  name: string;
  email: string;
  active: boolean;
  settings: Record<string, unknown>;
  timezone: string;
  created_at: string;
}

export async function getClientMinimal(db: Db, id: string): Promise<ClientMinimalRow | null> {
  const rows = await db
    .select({
      id: clients.id,
      name: clients.name,
      email: clients.email,
      active: clients.active,
      settings: clients.settings,
      timezone: clients.timezone,
      created_at: clients.created_at,
    })
    .from(clients)
    .where(and(eq(clients.id, id), eq(clients.active, true)))
    .limit(1);
  return rows[0] ?? null;
}
