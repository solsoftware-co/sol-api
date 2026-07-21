import {
  pgTable,
  text,
  boolean,
  jsonb,
  timestamp,
  bigserial,
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
  google_service_account_email: text("google_service_account_email"),
  google_service_account_key: text("google_service_account_key"),
  timezone: text("timezone").notNull().default("America/Chicago"),
  sanity_project_id: text("sanity_project_id"),
  sanity_production_dataset: text("sanity_production_dataset"),
  sanity_staging_dataset: text("sanity_staging_dataset"),
  github_repo: text("github_repo"),
  github_default_branch: text("github_default_branch").default("main"),
  github_test_branch: text("github_test_branch"),
  default_email: text("default_email"),
});

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
