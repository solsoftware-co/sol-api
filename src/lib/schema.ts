import {
  pgTable,
  text,
  boolean,
  jsonb,
  timestamp,
  bigserial,
  uuid,
  foreignKey,
  primaryKey,
  unique,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

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

// Wave 3 (SOL-35) of the client data model rework (see docs/design/data-model.md).
// A channel is a named, client-owned place a notification can go, configured
// as exactly one email_groups row or slack_channels row — the same
// "configured as" pattern as integrations → mailchimp_/google_sheets_integrations.
// Forms and analytics reports link to channels many-to-many.
//
// Same-client guarantees are enforced by the database, not by callers: every
// table something links *to* carries UNIQUE (client_id, id), and every link
// carries its own client_id with composite FKs to both sides — so a row
// joining one client's form to another client's channel can't be written.
//
// The same trick keeps a channel's configuration consistent with its type:
// each extension table (email_groups, slack_channels) carries a channel_type
// pinned by a CHECK to its own type, with a composite FK (channel_id,
// channel_type) → channels (id, type). An email channel can therefore only
// ever have an email_groups row, never a slack_channels row (and vice versa),
// and a channel's type can't be changed while it's configured.
// Matches channels_type_check below.
export type ChannelType = "email" | "slack";

export const channels = pgTable("channels", {
  id: uuid("id").primaryKey().defaultRandom(),
  client_id: text("client_id").notNull(),
  type: text("type").$type<ChannelType>().notNull(),
  name: text("name").notNull(),
  description: text("description"),
  created_at: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
}, (table) => [
  foreignKey({
    columns: [table.client_id],
    foreignColumns: [clients.id],
    name: "channels_client_id_fkey",
  }),
  unique("channels_client_id_id_key").on(table.client_id, table.id),
  unique("channels_id_type_key").on(table.id, table.type),
  // Human-facing picker names ("Sales team"), and what makes the Wave 3
  // backfill safe to re-run.
  unique("channels_client_id_name_key").on(table.client_id, table.name),
  check("channels_type_check", sql`${table.type} IN ('email', 'slack')`),
]);

export const email_groups = pgTable("email_groups", {
  channel_id: uuid("channel_id").primaryKey(),
  channel_type: text("channel_type").notNull().default("email"),
  email_addresses: text("email_addresses").array().notNull(),
}, (table) => [
  foreignKey({
    columns: [table.channel_id, table.channel_type],
    foreignColumns: [channels.id, channels.type],
    name: "email_groups_channel_id_channel_type_fkey",
  }),
  check("email_groups_channel_type_check", sql`${table.channel_type} = 'email'`),
]);

// The Slack-specific part of a channel: just the webhook. Its owner, name and
// description live on the channel (moved there by migration 0010).
export const slack_channels = pgTable("slack_channels", {
  id: uuid("id").primaryKey().defaultRandom(),
  channel_id: uuid("channel_id").notNull(),
  channel_type: text("channel_type").notNull().default("slack"),
  webhook_url: text("webhook_url").notNull(),
  created_at: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
}, (table) => [
  foreignKey({
    columns: [table.channel_id, table.channel_type],
    foreignColumns: [channels.id, channels.type],
    name: "slack_channels_channel_id_channel_type_fkey",
  }),
  unique("slack_channels_channel_id_key").on(table.channel_id),
  check("slack_channels_channel_type_check", sql`${table.channel_type} = 'slack'`),
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
  unique("integrations_client_id_id_key").on(table.client_id, table.id),
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
// Wave 3 (SOL-35) moved analytics_recipients/analytics_reports_enabled out to
// analytics_reports/analytics_report_channels.

export const sites = pgTable("sites", {
  id: uuid("id").primaryKey().defaultRandom(),
  client_id: text("client_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  domain: text("domain"),
  staging_domain: text("staging_domain"),
  ga4_property_id: text("ga4_property_id"),
  ga4_service_account_id: uuid("ga4_service_account_id"),
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
  unique("sites_client_id_id_key").on(table.client_id, table.id),
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

// Wave 3 (SOL-35): the public entrypoint's config — a protected endpoint a
// client owns. Sol Gate accepts submissions to it, validates them against
// payload_schema, runs the linked integrations, then notifies the linked
// channels. Deliberately not tied to a site: allowed_origins controls where
// it can be called from, and a form may not belong to any one website.
export const forms = pgTable("forms", {
  id: uuid("id").primaryKey().defaultRandom(),
  client_id: text("client_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  payload_schema: jsonb("payload_schema").$type<Record<string, unknown>>().notNull().default({}),
  allowed_origins: text("allowed_origins").array().notNull().default([]),
  created_at: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
}, (table) => [
  foreignKey({
    columns: [table.client_id],
    foreignColumns: [clients.id],
    name: "forms_client_id_fkey",
  }),
  unique("forms_client_id_id_key").on(table.client_id, table.id),
]);

// Which integrations a form runs. field_mapping maps the form's fields onto
// the integration's own field shape — per link, so two forms can feed one
// integration with different field names.
export const form_integrations = pgTable("form_integrations", {
  form_id: uuid("form_id").notNull(),
  integration_id: uuid("integration_id").notNull(),
  client_id: text("client_id").notNull(),
  field_mapping: jsonb("field_mapping").$type<Record<string, unknown>>().notNull().default({}),
}, (table) => [
  primaryKey({ name: "form_integrations_pkey", columns: [table.form_id, table.integration_id] }),
  foreignKey({
    columns: [table.client_id, table.form_id],
    foreignColumns: [forms.client_id, forms.id],
    name: "form_integrations_client_id_form_id_fkey",
  }),
  foreignKey({
    columns: [table.client_id, table.integration_id],
    foreignColumns: [integrations.client_id, integrations.id],
    name: "form_integrations_client_id_integration_id_fkey",
  }),
]);

// Which channels a form notifies, and how. template names a sol-notify email
// template; include_fields NULL means "every submitted field". message is a
// fixed string (e.g. a Slack message) — no substitution, so nothing to leak.
// Settings are data, not free-text templates: rendering stays in sol-notify's
// code. For now a form's notifications are only sent when its integrations
// succeed; failure notifications are a later decision.
export const form_channels = pgTable("form_channels", {
  form_id: uuid("form_id").notNull(),
  channel_id: uuid("channel_id").notNull(),
  client_id: text("client_id").notNull(),
  template: text("template").notNull().default("form_submission"),
  subject: text("subject"), // email only — Slack messages have none
  include_fields: text("include_fields").array(),
  message: text("message"),
}, (table) => [
  primaryKey({ name: "form_channels_pkey", columns: [table.form_id, table.channel_id] }),
  foreignKey({
    columns: [table.client_id, table.form_id],
    foreignColumns: [forms.client_id, forms.id],
    name: "form_channels_client_id_form_id_fkey",
  }),
  foreignKey({
    columns: [table.client_id, table.channel_id],
    foreignColumns: [channels.client_id, channels.id],
    name: "form_channels_client_id_channel_id_fkey",
  }),
]);

// Which of a form's integrations a notification reports on — a many-to-many
// inside the form_channels link (e.g. one email group hears only about
// Mailchimp, another about Mailchimp and Google Sheets). Reporting is opt-in:
// no rows for a form_channels link means the notification reports on NO
// integrations (e.g. a plain "form submitted" message). The two
// FKs guarantee a notification can only report integrations this form
// actually runs; same-client scoping follows from both parents.
export const form_channel_integrations = pgTable("form_channel_integrations", {
  form_id: uuid("form_id").notNull(),
  channel_id: uuid("channel_id").notNull(),
  integration_id: uuid("integration_id").notNull(),
}, (table) => [
  primaryKey({
    name: "form_channel_integrations_pkey",
    columns: [table.form_id, table.channel_id, table.integration_id],
  }),
  foreignKey({
    columns: [table.form_id, table.channel_id],
    foreignColumns: [form_channels.form_id, form_channels.channel_id],
    name: "form_channel_integrations_form_id_channel_id_fkey",
  }),
  foreignKey({
    columns: [table.form_id, table.integration_id],
    foreignColumns: [form_integrations.form_id, form_integrations.integration_id],
    name: "form_channel_integrations_form_id_integration_id_fkey",
  }),
]);

// A site's scheduled analytics report. cron is read in the client's timezone
// (clients.timezone); lookback is a named period preset rather than a raw
// duration ("rolling 30 days" vs "previous calendar month" is otherwise
// ambiguous). Deliberately not named "window" — that's a reserved word in
// Postgres. last_run_at lets a fixed-interval scheduler tick skip reports it
// already sent.
export const analytics_reports = pgTable("analytics_reports", {
  id: uuid("id").primaryKey().defaultRandom(),
  client_id: text("client_id").notNull(),
  site_id: uuid("site_id").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  cron: text("cron").notNull(),
  lookback: text("lookback").notNull(),
  last_run_at: timestamp("last_run_at", { withTimezone: true, mode: "string" }),
  created_at: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
}, (table) => [
  foreignKey({
    columns: [table.client_id],
    foreignColumns: [clients.id],
    name: "analytics_reports_client_id_fkey",
  }),
  foreignKey({
    columns: [table.client_id, table.site_id],
    foreignColumns: [sites.client_id, sites.id],
    name: "analytics_reports_client_id_site_id_fkey",
  }),
  unique("analytics_reports_client_id_id_key").on(table.client_id, table.id),
  check(
    "analytics_reports_lookback_check",
    sql`${table.lookback} IN ('last_week', 'last_month', 'last_7_days', 'last_28_days')`
  ),
]);

export const analytics_report_channels = pgTable("analytics_report_channels", {
  analytics_report_id: uuid("analytics_report_id").notNull(),
  channel_id: uuid("channel_id").notNull(),
  client_id: text("client_id").notNull(),
}, (table) => [
  primaryKey({ name: "analytics_report_channels_pkey", columns: [table.analytics_report_id, table.channel_id] }),
  foreignKey({
    columns: [table.client_id, table.analytics_report_id],
    foreignColumns: [analytics_reports.client_id, analytics_reports.id],
    name: "analytics_report_channels_client_id_analytics_report_id_fkey",
  }),
  foreignKey({
    columns: [table.client_id, table.channel_id],
    foreignColumns: [channels.client_id, channels.id],
    name: "analytics_report_channels_client_id_channel_id_fkey",
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

export type Channel = typeof channels.$inferSelect;
export type NewChannel = typeof channels.$inferInsert;

export type EmailGroup = typeof email_groups.$inferSelect;
export type NewEmailGroup = typeof email_groups.$inferInsert;

export type Form = typeof forms.$inferSelect;
export type NewForm = typeof forms.$inferInsert;

export type FormIntegration = typeof form_integrations.$inferSelect;
export type NewFormIntegration = typeof form_integrations.$inferInsert;

export type FormChannel = typeof form_channels.$inferSelect;
export type NewFormChannel = typeof form_channels.$inferInsert;

export type FormChannelIntegration = typeof form_channel_integrations.$inferSelect;
export type NewFormChannelIntegration = typeof form_channel_integrations.$inferInsert;

export type AnalyticsReport = typeof analytics_reports.$inferSelect;
export type NewAnalyticsReport = typeof analytics_reports.$inferInsert;

export type AnalyticsReportChannel = typeof analytics_report_channels.$inferSelect;
export type NewAnalyticsReportChannel = typeof analytics_report_channels.$inferInsert;
