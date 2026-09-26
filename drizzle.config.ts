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
    "sites",
    "sanity_configs",
    "github_repos",
    "channels",
    "email_groups",
    "forms",
    "form_integrations",
    "form_channels",
    "form_channel_integrations",
    "analytics_reports",
    "analytics_report_channels",
  ],
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
