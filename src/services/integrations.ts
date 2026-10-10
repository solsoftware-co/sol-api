import type { Db } from "../lib/db.js";
import {
  getIntegrationBase,
  getMailchimpChild,
  getGoogleSheetsChild,
  insertIntegration,
} from "../repositories/integrations.js";
import { findMissingIds, InvalidReferencesError } from "../repositories/references.js";
import { google_service_accounts } from "../lib/schema.js";
import type { CreateIntegrationInput } from "../validators/integration.js";

export { ClientNotFoundError } from "../repositories/clients.js";
export { InvalidReferencesError } from "../repositories/references.js";
import { snakeToCamelKeys } from "../lib/case.js";

export interface IntegrationBaseResponse {
  id: string;
  clientId: string;
  type: string;
  name: string | null;
  description: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface MailchimpIntegrationResponse extends IntegrationBaseResponse {
  type: "mailchimp";
  mailchimp: { apiKey: string; listId: string; serverPrefix: string } | null;
}

export interface GoogleSheetsIntegrationResponse extends IntegrationBaseResponse {
  type: "google_sheets";
  googleSheets: {
    spreadsheetId: string;
    sheetName: string | null;
    columnMapping: string[];
    tableAnchor: string | null;
    googleServiceAccount: { email: string; key: string };
  } | null;
}

export type IntegrationResponse =
  | MailchimpIntegrationResponse
  | GoogleSheetsIntegrationResponse
  | IntegrationBaseResponse;

export async function getIntegration(
  db: Db,
  clientId: string,
  integrationId: string
): Promise<IntegrationResponse | null> {
  const base = await getIntegrationBase(db, clientId, integrationId);
  if (!base) return null;

  const baseResponse = snakeToCamelKeys(base);

  if (base.type === "mailchimp") {
    const child = await getMailchimpChild(db, integrationId);
    return {
      ...baseResponse,
      type: "mailchimp",
      mailchimp: child ? snakeToCamelKeys(child) : null,
    };
  }

  if (base.type === "google_sheets") {
    const child = await getGoogleSheetsChild(db, integrationId);
    return {
      ...baseResponse,
      type: "google_sheets",
      googleSheets: child
        ? {
            spreadsheetId: child.spreadsheet_id,
            sheetName: child.sheet_name,
            columnMapping: child.column_mapping,
            tableAnchor: child.table_anchor,
            googleServiceAccount: { email: child.gsa_email, key: child.gsa_key },
          }
        : null,
    };
  }

  return baseResponse;
}

// A Google Sheets integration's service account must be one of this client's:
// checked first so the 422 names it (the same-client FK backs this up). Reads
// the new integration back through getIntegration, so the create response is
// exactly what GET /integrations/:id returns.
export async function createIntegration(
  db: Db,
  clientId: string,
  input: CreateIntegrationInput
): Promise<IntegrationResponse> {
  const common = { client_id: clientId, name: input.name, description: input.description ?? null };

  let id: string;
  if (input.type === "mailchimp") {
    id = await insertIntegration(db, {
      ...common,
      type: "mailchimp",
      api_key: input.apiKey,
      list_id: input.listId,
      server_prefix: input.serverPrefix,
    });
  } else {
    const missing = await findMissingIds(db, google_service_accounts, clientId, [input.googleServiceAccountId]);
    if (missing.length > 0) throw new InvalidReferencesError({ googleServiceAccountId: missing });
    id = await insertIntegration(db, {
      ...common,
      type: "google_sheets",
      google_service_account_id: input.googleServiceAccountId,
      spreadsheet_id: input.spreadsheetId,
      sheet_name: input.sheetName ?? null,
      column_mapping: input.columnMapping,
      table_anchor: input.tableAnchor,
    });
  }

  const integration = await getIntegration(db, clientId, id);
  if (!integration) throw new Error(`Integration ${id} not found after insert`);
  return integration;
}

