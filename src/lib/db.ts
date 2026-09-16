import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { sql } from "drizzle-orm";

export type Db = ReturnType<typeof drizzle>;

export function createDb(url: string): Db {
  return drizzle(neon(url));
}

export async function healthCheck(db: Db): Promise<void> {
  await db.execute(sql`SELECT 1`);
}
