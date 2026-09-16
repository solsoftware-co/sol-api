import { eq, and } from "drizzle-orm";
import {
  integrations,
  mailchimp_integrations,
  google_sheets_integrations,
  google_service_accounts,
} from "../lib/schema.js";
import type { Db } from "../lib/db.js";

export interface IntegrationBaseRow {
  id: string;
  client_id: string;
  type: string;
  name: string | null;
  description: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface MailchimpChildRow {
  api_key: string;
  list_id: string;
  server_prefix: string;
}

export interface GoogleSheetsChildRow {
  spreadsheet_id: string;
  sheet_name: string | null;
  column_mapping: string[];
  table_anchor: string | null;
  gsa_email: string;
  gsa_key: string;
}

export async function getIntegrationBase(
  db: Db,
  clientId: string,
  integrationId: string
): Promise<IntegrationBaseRow | null> {
  const rows = await db
    .select({
      id: integrations.id,
      client_id: integrations.client_id,
      type: integrations.type,
      name: integrations.name,
      description: integrations.description,
      status: integrations.status,
      created_at: integrations.created_at,
      updated_at: integrations.updated_at,
    })
    .from(integrations)
    .where(and(eq(integrations.id, integrationId), eq(integrations.client_id, clientId)))
    .limit(1);
  return rows[0] ?? null;
}

// Purpose-built per type — only the child table matching the row's actual
// type is ever queried, never a blanket join across every integration kind.
export async function getMailchimpChild(db: Db, integrationId: string): Promise<MailchimpChildRow | null> {
  const rows = await db
    .select({
      api_key: mailchimp_integrations.api_key,
      list_id: mailchimp_integrations.list_id,
      server_prefix: mailchimp_integrations.server_prefix,
    })
    .from(mailchimp_integrations)
    .where(eq(mailchimp_integrations.integration_id, integrationId))
    .limit(1);
  return rows[0] ?? null;
}

export async function getGoogleSheetsChild(db: Db, integrationId: string): Promise<GoogleSheetsChildRow | null> {
  const rows = await db
    .select({
      spreadsheet_id: google_sheets_integrations.spreadsheet_id,
      sheet_name: google_sheets_integrations.sheet_name,
      column_mapping: google_sheets_integrations.column_mapping,
      table_anchor: google_sheets_integrations.table_anchor,
      gsa_email: google_service_accounts.email,
      gsa_key: google_service_accounts.key,
    })
    .from(google_sheets_integrations)
    .innerJoin(
      google_service_accounts,
      eq(google_sheets_integrations.google_service_account_id, google_service_accounts.id)
    )
    .where(eq(google_sheets_integrations.integration_id, integrationId))
    .limit(1);
  return rows[0] ?? null;
}
