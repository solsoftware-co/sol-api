import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/lib/schema.ts",
  out: "./db/migrations",
  migrations: {
    table: "sol_api_migrations",
  },
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
