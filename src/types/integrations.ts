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
