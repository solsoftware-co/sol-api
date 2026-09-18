import type { NeonQueryFunction } from "@neondatabase/serverless";

type Sql = NeonQueryFunction<false, false>;

export async function insertTestClient(
  sql: Sql,
  opts: { id: string; name?: string; email?: string; active?: boolean; timezone?: string }
): Promise<void> {
  await sql`
    INSERT INTO clients (id, name, email, active, settings, timezone)
    VALUES (
      ${opts.id},
      ${opts.name ?? "Test Client"},
      ${opts.email ?? "test@example.com"},
      ${opts.active ?? true},
      '{}',
      ${opts.timezone ?? "America/Chicago"}
    )
    ON CONFLICT (id) DO NOTHING
  `;
}

export async function insertTestGoogleServiceAccount(
  sql: Sql,
  opts: { clientId: string; email?: string; key?: string; name?: string }
): Promise<string> {
  const rows = await sql`
    INSERT INTO google_service_accounts (client_id, name, email, key)
    VALUES (
      ${opts.clientId},
      ${opts.name ?? "Test Service Account"},
      ${opts.email ?? "sa@project.iam.gserviceaccount.com"},
      ${opts.key ?? "-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----"}
    )
    RETURNING id
  `;
  return (rows[0] as { id: string }).id;
}

export async function insertTestSite(
  sql: Sql,
  opts: {
    clientId: string;
    name?: string;
    domain?: string | null;
    ga4PropertyId?: string | null;
    ga4ServiceAccountId?: string | null;
    analyticsRecipients?: string[];
    analyticsReportsEnabled?: boolean;
  }
): Promise<string> {
  const rows = await sql`
    INSERT INTO sites (
      client_id, name, domain, ga4_property_id, ga4_service_account_id,
      analytics_recipients, analytics_reports_enabled
    )
    VALUES (
      ${opts.clientId},
      ${opts.name ?? "Test Site"},
      ${opts.domain ?? null},
      ${opts.ga4PropertyId ?? null},
      ${opts.ga4ServiceAccountId ?? null},
      ${opts.analyticsRecipients ?? []},
      ${opts.analyticsReportsEnabled ?? true}
    )
    RETURNING id
  `;
  return (rows[0] as { id: string }).id;
}

export async function insertTestSlackChannel(
  sql: Sql,
  opts: { clientId: string; name?: string; description?: string | null; webhookUrl?: string }
): Promise<string> {
  const rows = await sql`
    INSERT INTO slack_channels (client_id, name, description, webhook_url)
    VALUES (
      ${opts.clientId},
      ${opts.name ?? "Test Channel"},
      ${opts.description ?? null},
      ${opts.webhookUrl ?? "https://hooks.slack.com/services/T000/B000/XXXX"}
    )
    RETURNING id
  `;
  return (rows[0] as { id: string }).id;
}

type MailchimpChild = { apiKey?: string; listId?: string; serverPrefix?: string };
type GoogleSheetsChild = {
  googleServiceAccountId: string;
  spreadsheetId?: string;
  sheetName?: string | null;
  columnMapping?: string[];
  tableAnchor?: string;
};

export async function insertTestIntegration(
  sql: Sql,
  opts: {
    clientId: string;
    type: "mailchimp" | "google_sheets";
    name?: string;
    description?: string | null;
    status?: string;
    mailchimp?: MailchimpChild;
    googleSheets?: GoogleSheetsChild;
  }
): Promise<string> {
  const rows = await sql`
    INSERT INTO integrations (client_id, type, name, description, status)
    VALUES (
      ${opts.clientId},
      ${opts.type},
      ${opts.name ?? "Test Integration"},
      ${opts.description ?? null},
      ${opts.status ?? "active"}
    )
    RETURNING id
  `;
  const integrationId = (rows[0] as { id: string }).id;

  if (opts.type === "mailchimp") {
    const mc = opts.mailchimp ?? {};
    await sql`
      INSERT INTO mailchimp_integrations (integration_id, api_key, list_id, server_prefix)
      VALUES (
        ${integrationId},
        ${mc.apiKey ?? "test-mailchimp-key"},
        ${mc.listId ?? "test-list-id"},
        ${mc.serverPrefix ?? "us21"}
      )
    `;
  } else if (opts.type === "google_sheets") {
    if (!opts.googleSheets) {
      throw new Error("insertTestIntegration: googleSheets fixture requires googleServiceAccountId");
    }
    const gs = opts.googleSheets;
    await sql`
      INSERT INTO google_sheets_integrations (
        integration_id, google_service_account_id, spreadsheet_id, sheet_name, column_mapping, table_anchor
      )
      VALUES (
        ${integrationId},
        ${gs.googleServiceAccountId},
        ${gs.spreadsheetId ?? "test-spreadsheet-id"},
        ${gs.sheetName ?? "Sheet1"},
        ${gs.columnMapping ?? ["timestamp", "email"]},
        ${gs.tableAnchor ?? "A1"}
      )
    `;
  }

  return integrationId;
}

// FK-ordered teardown covering every table a test fixture might have
// populated for a given client, including the integration child tables
// (a gap in the previous per-file helper this replaces).
export async function deleteTestClientCascade(
  sql: Sql,
  clientId: string
): Promise<void> {
  await sql`
    DELETE FROM mailchimp_integrations
    WHERE integration_id IN (SELECT id FROM integrations WHERE client_id = ${clientId})
  `;
  await sql`
    DELETE FROM google_sheets_integrations
    WHERE integration_id IN (SELECT id FROM integrations WHERE client_id = ${clientId})
  `;
  await sql`DELETE FROM integrations WHERE client_id = ${clientId}`;
  await sql`DELETE FROM sanity_configs WHERE site_id IN (SELECT id FROM sites WHERE client_id = ${clientId})`;
  await sql`DELETE FROM github_repos WHERE site_id IN (SELECT id FROM sites WHERE client_id = ${clientId})`;
  await sql`DELETE FROM sites WHERE client_id = ${clientId}`;
  await sql`DELETE FROM slack_channels WHERE client_id = ${clientId}`;
  await sql`DELETE FROM google_service_accounts WHERE client_id = ${clientId}`;
  await sql`DELETE FROM clients WHERE id = ${clientId}`;
}
