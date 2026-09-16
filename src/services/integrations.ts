import type { Db } from "../lib/db.js";
import {
  getIntegrationBase,
  getMailchimpChild,
  getGoogleSheetsChild,
} from "../repositories/integrations.js";
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
      mailchimp: child ? (snakeToCamelKeys(child) as { apiKey: string; listId: string; serverPrefix: string }) : null,
    } as IntegrationResponse;
  }

  if (base.type === "google_sheets") {
    const child = await getGoogleSheetsChild(db, integrationId);
    return {
      ...baseResponse,
      googleSheets: child
        ? {
            spreadsheetId: child.spreadsheet_id,
            sheetName: child.sheet_name,
            columnMapping: child.column_mapping,
            tableAnchor: child.table_anchor,
            googleServiceAccount: { email: child.gsa_email, key: child.gsa_key },
          }
        : null,
    } as IntegrationResponse;
  }

  return baseResponse as unknown as IntegrationResponse;
}
