import type { NeonQueryFunction, NeonQueryPromise } from "@neondatabase/serverless";

// The sandbox integrations sol-integrate's PR-preview e2e suite writes
// through (its tests/e2e/). Its previews bind SOL_API to sol-api-dev, so
// these rows live in the persistent `dev` database: release.yml seeds them
// on every merge to main, and seed-dev.yml re-seeds on demand (e.g. after
// `npm run db:branch:reset` wipes dev).
//
// Every row points at a dedicated sandbox account, never a client's. The IDs
// are fixed so the suite can reference them directly — keep them in sync
// with sol-integrate's tests/e2e/fixtures.ts, and the Sheets column_mapping
// and tab with its tests/e2e/google-sheets.test.ts.

type Sql = NeonQueryFunction<false, false>;

export const SOL_INTEGRATE_E2E_IDS = {
  mailchimp: "e2e00000-0000-4000-8000-000000000001",
  mailchimpBrokenKey: "e2e00000-0000-4000-8000-000000000002",
  sheets: "e2e00000-0000-4000-8000-000000000003",
  sheetsMissingSpreadsheet: "e2e00000-0000-4000-8000-000000000004",
  googleServiceAccount: "e2e00000-0000-4000-8000-0000000000a1",
} as const;

export const SHEETS_TAB = "E2E";
export const SHEETS_COLUMN_MAPPING = ["_timestamp", "name", "email", "_submissionId"];
const MISSING_SPREADSHEET_ID = "1e2eSpreadsheetThatDoesNotExist000000000000";
// A 32-hex key on the real datacenter, so the request reaches Mailchimp and
// gets a real 401 rather than failing on DNS.
const BROKEN_MAILCHIMP_KEY = "00000000000000000000000000000000";

export interface SolIntegrateSandbox {
  /** The sandbox Mailchimp account's API key, ending in -usXX. */
  mailchimpApiKey: string;
  mailchimpAudienceId: string;
  /** The sandbox service account's email and key (a JSON key file, as-is). */
  googleServiceAccountEmail: string;
  googleServiceAccountKey: string;
  spreadsheetId: string;
}

function requireEnv(env: Record<string, string | undefined>, name: string): string {
  const value = env[name];
  if (!value) throw new Error(`${name} environment variable is required to seed sol-integrate's e2e fixtures`);
  return value;
}

/** Reads the sandbox credentials from the same-named GitHub secrets sol-integrate's own e2e uses. */
export function solIntegrateSandboxFromEnv(env: Record<string, string | undefined>): SolIntegrateSandbox {
  const mailchimpApiKey = requireEnv(env, "MAILCHIMP_SANDBOX_API_KEY");
  if (!/-[a-z]+\d+$/.test(mailchimpApiKey)) throw new Error("MAILCHIMP_SANDBOX_API_KEY must end in its -usXX datacenter");

  const keyFile = requireEnv(env, "GOOGLE_SHEETS_SANDBOX_SERVICE_ACCOUNT");
  let googleServiceAccountEmail: unknown;
  try {
    googleServiceAccountEmail = (JSON.parse(keyFile) as { client_email?: unknown }).client_email;
  } catch {
    // Never echo the value — it's a private key.
    throw new Error("GOOGLE_SHEETS_SANDBOX_SERVICE_ACCOUNT must be the service account's JSON key file");
  }
  if (typeof googleServiceAccountEmail !== "string" || !googleServiceAccountEmail) {
    throw new Error("GOOGLE_SHEETS_SANDBOX_SERVICE_ACCOUNT has no client_email");
  }

  return {
    mailchimpApiKey,
    mailchimpAudienceId: requireEnv(env, "MAILCHIMP_SANDBOX_AUDIENCE_ID"),
    googleServiceAccountEmail,
    googleServiceAccountKey: keyFile,
    spreadsheetId: requireEnv(env, "GOOGLE_SHEETS_SANDBOX_SPREADSHEET_ID"),
  };
}

// Upserts, so re-running is always safe. Returned as queries for one
// sql.transaction(): all of it lands, or none. `clientId` must already exist
// (integrations.client_id is a foreign key) — it's `sol` in dev; the
// integration test passes a throwaway client.
export function solIntegrateSeedQueries(sql: Sql, sandbox: SolIntegrateSandbox, clientId = "sol"): NeonQueryPromise<false, false>[] {
  const ids = SOL_INTEGRATE_E2E_IDS;
  const serverPrefix = sandbox.mailchimpApiKey.split("-").pop()!;

  const integration = (id: string, type: string, name: string, description: string) => sql`
    INSERT INTO integrations (id, client_id, type, name, description, status)
    VALUES (${id}, ${clientId}, ${type}, ${name}, ${description}, 'active')
    ON CONFLICT (id) DO UPDATE SET
      client_id = EXCLUDED.client_id, type = EXCLUDED.type, name = EXCLUDED.name,
      description = EXCLUDED.description, status = EXCLUDED.status, updated_at = now()
  `;

  const mailchimp = (id: string, apiKey: string) => sql`
    INSERT INTO mailchimp_integrations (integration_id, api_key, list_id, server_prefix)
    VALUES (${id}, ${apiKey}, ${sandbox.mailchimpAudienceId}, ${serverPrefix})
    ON CONFLICT (integration_id) DO UPDATE SET
      api_key = EXCLUDED.api_key, list_id = EXCLUDED.list_id, server_prefix = EXCLUDED.server_prefix
  `;

  const sheet = (id: string, spreadsheetId: string) => sql`
    INSERT INTO google_sheets_integrations
      (integration_id, client_id, google_service_account_id, spreadsheet_id, sheet_name, column_mapping, table_anchor)
    VALUES (${id}, ${clientId}, ${ids.googleServiceAccount}, ${spreadsheetId}, ${SHEETS_TAB}, ${SHEETS_COLUMN_MAPPING}, 'A1')
    ON CONFLICT (integration_id) DO UPDATE SET
      client_id = EXCLUDED.client_id, google_service_account_id = EXCLUDED.google_service_account_id,
      spreadsheet_id = EXCLUDED.spreadsheet_id, sheet_name = EXCLUDED.sheet_name,
      column_mapping = EXCLUDED.column_mapping, table_anchor = EXCLUDED.table_anchor
  `;

  return [
    // Mailchimp (SOL-20): a working key, and a deliberately broken one for the failed outcome.
    integration(ids.mailchimp, "mailchimp", "E2E sandbox", "sol-integrate e2e (SOL-20): sandbox Mailchimp account, working key"),
    integration(ids.mailchimpBrokenKey, "mailchimp", "E2E sandbox (broken key)", "sol-integrate e2e (SOL-20): deliberately invalid key, exercises the failed outcome"),
    mailchimp(ids.mailchimp, sandbox.mailchimpApiKey),
    mailchimp(ids.mailchimpBrokenKey, `${BROKEN_MAILCHIMP_KEY}-${serverPrefix}`),

    // Google Sheets (SOL-10): the sandbox spreadsheet's E2E tab, and one that doesn't exist for the failed outcome.
    sql`
      INSERT INTO google_service_accounts (id, client_id, name, description, email, key)
      VALUES (${ids.googleServiceAccount}, ${clientId}, 'E2E sandbox', 'sol-integrate e2e (SOL-10): sandbox service account',
              ${sandbox.googleServiceAccountEmail}, ${sandbox.googleServiceAccountKey})
      ON CONFLICT (id) DO UPDATE SET
        client_id = EXCLUDED.client_id, name = EXCLUDED.name, description = EXCLUDED.description,
        email = EXCLUDED.email, key = EXCLUDED.key, updated_at = now()
    `,
    integration(ids.sheets, "google_sheets", "E2E sandbox sheet", "sol-integrate e2e (SOL-10): sandbox spreadsheet, E2E tab"),
    integration(ids.sheetsMissingSpreadsheet, "google_sheets", "E2E sandbox sheet (missing spreadsheet)", "sol-integrate e2e (SOL-10): spreadsheet ID that does not exist, exercises the failed outcome"),
    sheet(ids.sheets, sandbox.spreadsheetId),
    sheet(ids.sheetsMissingSpreadsheet, MISSING_SPREADSHEET_ID),
  ];
}
