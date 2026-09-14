import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/lib/schema.ts",
  out: "./db/migrations",
  migrations: {
    table: "sol_api_migrations",
  },
  tablesFilter: [
    "clients",
    "notification_logs",
    "google_service_accounts",
    "slack_channels",
    "integrations",
    "mailchimp_integrations",
    "google_sheets_integrations",
  ],
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
