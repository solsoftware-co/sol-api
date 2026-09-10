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
  ga4_property_id: text("ga4_property_id"),
  active: boolean("active").notNull().default(true),
  settings: jsonb("settings").$type<Record<string, unknown>>().notNull().default({}),
  created_at: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  timezone: text("timezone").notNull().default("America/Chicago"),
  sanity_project_id: text("sanity_project_id"),
  sanity_production_dataset: text("sanity_production_dataset"),
  sanity_staging_dataset: text("sanity_staging_dataset"),
  github_repo: text("github_repo"),
  github_default_branch: text("github_default_branch").default("main"),
  github_test_branch: text("github_test_branch"),
});

// Wave 1 of the client data model rework (see docs/design/data-model.md).
// clients.google_service_account_email/_key and clients.slack_webhook_url are gone —
// db.ts has read/written these tables exclusively since the cutover (#19).

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

export const google_drive_integrations = pgTable("google_drive_integrations", {
  integration_id: uuid("integration_id").primaryKey(),
  google_service_account_id: uuid("google_service_account_id").notNull(),
  folder_id: text("folder_id").notNull(),
}, (table) => [
  foreignKey({
    columns: [table.integration_id],
    foreignColumns: [integrations.id],
    name: "google_drive_integrations_integration_id_fkey",
  }),
  foreignKey({
    columns: [table.google_service_account_id],
    foreignColumns: [google_service_accounts.id],
    name: "google_drive_integrations_google_service_account_id_fkey",
  }),
]);

export const notification_logs = pgTable("notification_logs", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  client_id: text("client_id").notNull(),
  workflow: text("workflow").notNull(),
  event_name: text("event_name").notNull(),
  outcome: text("outcome").notNull(),
  created_at: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  recipient_email: text("recipient_email"),
  subject: text("subject"),
  resend_id: text("resend_id"),
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

export type GoogleDriveIntegration = typeof google_drive_integrations.$inferSelect;
export type NewGoogleDriveIntegration = typeof google_drive_integrations.$inferInsert;
