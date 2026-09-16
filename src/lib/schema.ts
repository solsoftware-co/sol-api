import {
  pgTable,
  text,
  boolean,
  jsonb,
  timestamp,
  bigserial,
  uuid,
  foreignKey,
} from "drizzle-orm/pg-core";

export const clients = pgTable("clients", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  active: boolean("active").notNull().default(true),
  settings: jsonb("settings").$type<Record<string, unknown>>().notNull().default({}),
  created_at: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  timezone: text("timezone").notNull().default("America/Chicago"),
});

// Wave 1 of the client data model rework (see docs/design/data-model.md).
// clients.google_service_account_email/_key and clients.slack_webhook_url are gone —
// db.ts has read/written these tables exclusively since the cutover (#19).
//
// Wave 2 (SOL-22): clients.ga4_property_id/sanity_*/github_* are gone too —
// sites/sanity_configs/github_repos have been the source of truth since the
// cutover (PR #24), this just drops the now-dead columns.

export const google_service_accounts = pgTable("google_service_accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  client_id: text("client_id").notNull(),
  name: text("name"),
  description: text("description"),
  email: text("email").notNull(),
  key: text("key").notNull(),
  created_at: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
}, (table) => [
  foreignKey({
    columns: [table.client_id],
    foreignColumns: [clients.id],
    name: "google_service_accounts_client_id_fkey",
  }),
]);

export const slack_channels = pgTable("slack_channels", {
  id: uuid("id").primaryKey().defaultRandom(),
  client_id: text("client_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  webhook_url: text("webhook_url").notNull(),
  created_at: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
}, (table) => [
  foreignKey({
    columns: [table.client_id],
    foreignColumns: [clients.id],
    name: "slack_channels_client_id_fkey",
  }),
]);

export const integrations = pgTable("integrations", {
  id: uuid("id").primaryKey().defaultRandom(),
  client_id: text("client_id").notNull(),
  type: text("type").notNull(),
  name: text("name"),
  description: text("description"),
  status: text("status").notNull().default("active"),
  created_at: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
}, (table) => [
  foreignKey({
    columns: [table.client_id],
    foreignColumns: [clients.id],
    name: "integrations_client_id_fkey",
  }),
]);

export const mailchimp_integrations = pgTable("mailchimp_integrations", {
  integration_id: uuid("integration_id").primaryKey(),
  api_key: text("api_key").notNull(),
  list_id: text("list_id").notNull(),
  server_prefix: text("server_prefix").notNull(),
}, (table) => [
  foreignKey({
    columns: [table.integration_id],
    foreignColumns: [integrations.id],
    name: "mailchimp_integrations_integration_id_fkey",
  }),
]);

export const google_sheets_integrations = pgTable("google_sheets_integrations", {
  integration_id: uuid("integration_id").primaryKey(),
  google_service_account_id: uuid("google_service_account_id").notNull(),
  spreadsheet_id: text("spreadsheet_id").notNull(),
  sheet_name: text("sheet_name"),
  column_mapping: text("column_mapping").array().notNull(),
  table_anchor: text("table_anchor").default("A1"),
}, (table) => [
  foreignKey({
    columns: [table.integration_id],
    foreignColumns: [integrations.id],
    name: "google_sheets_integrations_integration_id_fkey",
  }),
  foreignKey({
    columns: [table.google_service_account_id],
    foreignColumns: [google_service_accounts.id],
    name: "google_sheets_integrations_google_service_account_id_fkey",
  }),
]);

// Wave 2 of the client data model rework (see docs/design/data-model.md).
// Expand step only — clients.ga4_property_id/timezone/sanity_*/github_* stay in place
// until the read/write cutover (a later, separate step).

export const sites = pgTable("sites", {
  id: uuid("id").primaryKey().defaultRandom(),
  client_id: text("client_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  domain: text("domain"),
  staging_domain: text("staging_domain"),
  ga4_property_id: text("ga4_property_id"),
  ga4_service_account_id: uuid("ga4_service_account_id"),
  analytics_recipients: text("analytics_recipients").array().notNull().default([]),
  analytics_reports_enabled: boolean("analytics_reports_enabled").notNull().default(true),
  created_at: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
}, (table) => [
  foreignKey({
    columns: [table.client_id],
    foreignColumns: [clients.id],
    name: "sites_client_id_fkey",
  }),
  foreignKey({
    columns: [table.ga4_service_account_id],
    foreignColumns: [google_service_accounts.id],
    name: "sites_ga4_service_account_id_fkey",
  }),
]);

export const sanity_configs = pgTable("sanity_configs", {
  site_id: uuid("site_id").primaryKey(),
  project_id: text("project_id").notNull(),
  prod_dataset: text("prod_dataset").notNull(),
  staging_dataset: text("staging_dataset").notNull(),
}, (table) => [
  foreignKey({
    columns: [table.site_id],
    foreignColumns: [sites.id],
    name: "sanity_configs_site_id_fkey",
  }),
]);

export const github_repos = pgTable("github_repos", {
  site_id: uuid("site_id").primaryKey(),
  repo_url: text("repo_url").notNull(),
  default_branch: text("default_branch").notNull().default("main"),
  staging_branch: text("staging_branch"),
}, (table) => [
  foreignKey({
    columns: [table.site_id],
    foreignColumns: [sites.id],
    name: "github_repos_site_id_fkey",
  }),
]);

export const notification_logs = pgTable("notification_logs", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  client_id: text("client_id").notNull(),
  workflow: text("workflow").notNull(),
  event_name: text("event_name").notNull(),
  outcome: text("outcome").notNull(),
  created_at: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  type: text("type").notNull().default("email"),
  recipient_email: text("recipient_email"),
  subject: text("subject"),
  resend_id: text("resend_id"),
  slack_webhook_url: text("slack_webhook_url"),
  error_message: text("error_message"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
}, (table) => [
  foreignKey({
    columns: [table.client_id],
    foreignColumns: [clients.id],
    name: "notification_logs_client_id_fkey",
  }),
]);

export type Client = typeof clients.$inferSelect;
export type NewClient = typeof clients.$inferInsert;

export type GoogleServiceAccount = typeof google_service_accounts.$inferSelect;
export type NewGoogleServiceAccount = typeof google_service_accounts.$inferInsert;

export type SlackChannel = typeof slack_channels.$inferSelect;
export type NewSlackChannel = typeof slack_channels.$inferInsert;

export type Integration = typeof integrations.$inferSelect;
export type NewIntegration = typeof integrations.$inferInsert;

export type MailchimpIntegration = typeof mailchimp_integrations.$inferSelect;
export type NewMailchimpIntegration = typeof mailchimp_integrations.$inferInsert;

export type GoogleSheetsIntegration = typeof google_sheets_integrations.$inferSelect;
export type NewGoogleSheetsIntegration = typeof google_sheets_integrations.$inferInsert;

export type Site = typeof sites.$inferSelect;
export type NewSite = typeof sites.$inferInsert;

export type SanityConfig = typeof sanity_configs.$inferSelect;
export type NewSanityConfig = typeof sanity_configs.$inferInsert;

export type GithubRepo = typeof github_repos.$inferSelect;
export type NewGithubRepo = typeof github_repos.$inferInsert;
