import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { migrate } from "drizzle-orm/neon-http/migrator";
import path from "path";
import { fileURLToPath } from "url";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error("DATABASE_URL environment variable is required");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(__dirname, "../db/migrations");

const sql = neon(DATABASE_URL);
const db = drizzle(sql);

console.log("Running migrations from:", migrationsFolder);
await migrate(db, { migrationsFolder, migrationsTable: "sol_api_migrations" });
console.log("Migrations complete.");
