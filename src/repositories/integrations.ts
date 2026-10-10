import { eq, and } from "drizzle-orm";
import {
  integrations,
  mailchimp_integrations,
  google_sheets_integrations,
  google_service_accounts,
} from "../lib/schema.js";
import type { Db } from "../lib/db.js";
import { pgErrorCode, pgErrorConstraint } from "../lib/pg-errors.js";
import { ClientNotFoundError } from "./clients.js";
import { InvalidReferencesError } from "./references.js";

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

export type NewIntegration =
  | {
      client_id: string;
      type: "mailchimp";
      name: string;
      description: string | null;
      api_key: string;
      list_id: string;
      server_prefix: string;
    }
  | {
      client_id: string;
      type: "google_sheets";
      name: string;
      description: string | null;
      google_service_account_id: string;
      spreadsheet_id: string;
      sheet_name: string | null;
      column_mapping: string[];
      table_anchor?: string;
    };

// The integration and its type-specific half in one db.batch (one
// transaction), with the id generated here so both inserts are known up
// front. Two FKs can fail: the integration's client (→ 404), or — for Google
// Sheets — the same-client FK to the service account, if it was deleted or
// never this client's after the service's pre-check (→ the same 422 the
// pre-check gives).
export async function insertIntegration(db: Db, data: NewIntegration): Promise<string> {
  const id = crypto.randomUUID();
  const integration = db.insert(integrations).values({
    id,
    client_id: data.client_id,
    type: data.type,
    name: data.name,
    description: data.description,
  });
  const subtype =
    data.type === "mailchimp"
      ? db.insert(mailchimp_integrations).values({
          integration_id: id,
          api_key: data.api_key,
          list_id: data.list_id,
          server_prefix: data.server_prefix,
        })
      : db.insert(google_sheets_integrations).values({
          integration_id: id,
          client_id: data.client_id,
          google_service_account_id: data.google_service_account_id,
          spreadsheet_id: data.spreadsheet_id,
          sheet_name: data.sheet_name,
          column_mapping: data.column_mapping,
          ...(data.table_anchor !== undefined && { table_anchor: data.table_anchor }),
        });

  try {
    await db.batch([integration, subtype]);
    return id;
  } catch (err: unknown) {
    if (pgErrorCode(err) === "23503") {
      if (
        data.type === "google_sheets" &&
        pgErrorConstraint(err) === "google_sheets_integrations_client_id_gsa_id_fkey"
      ) {
        throw new InvalidReferencesError({ googleServiceAccountId: [data.google_service_account_id] });
      }
      throw new ClientNotFoundError(data.client_id);
    }
    throw err;
  }
}

