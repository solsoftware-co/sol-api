import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { env } from "cloudflare:test";
import { neon } from "@neondatabase/serverless";
import app from "../../src/index.js";
import type { Env } from "../../src/types/index.js";
import { createDb } from "../../src/lib/db.js";
import { insertIntegration } from "../../src/repositories/integrations.js";
import { InvalidReferencesError } from "../../src/repositories/references.js";
import {
  insertTestClient,
  insertTestGoogleServiceAccount,
  insertTestIntegration,
  deleteTestClientCascade,
} from "../helpers/db-fixtures.js";

const DB_URL = (env as unknown as Env).DATABASE_URL;
const API_KEY = "test-api-key";
const TEST_ENV = { DATABASE_URL: DB_URL ?? "", API_KEY, ENVIRONMENT: "test" };

const CLIENT_ID = `test-integ-client-${Date.now()}`;
const OTHER_CLIENT_ID = `test-integ-other-${Date.now()}`;
let MAILCHIMP_ID: string;
let GOOGLE_SHEETS_ID: string;
let OWN_GSA_ID: string;
let OTHER_GSA_ID: string;

function authed(init: RequestInit = {}): RequestInit {
  return { ...init, headers: { ...(init.headers as Record<string, string>), "X-API-Key": API_KEY } };
}

function skipIfNoDb(testFn: () => Promise<void>): () => Promise<void> {
  return async () => {
    if (!DB_URL) {
      console.warn("Skipping DB test: DATABASE_URL not set");
      return;
    }
    await testFn();
  };
}

beforeAll(async () => {
  if (!DB_URL) return;
  const sql = neon(DB_URL);
  await insertTestClient(sql, { id: CLIENT_ID });
  await insertTestClient(sql, { id: OTHER_CLIENT_ID });

  MAILCHIMP_ID = await insertTestIntegration(sql, {
    clientId: CLIENT_ID,
    type: "mailchimp",
    name: "Main Newsletter List",
    mailchimp: { apiKey: "mc-key-123", listId: "list-123", serverPrefix: "us21" },
  });

  OWN_GSA_ID = await insertTestGoogleServiceAccount(sql, {
    clientId: CLIENT_ID,
    email: "sa@project.iam.gserviceaccount.com",
    key: "-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----",
  });
  GOOGLE_SHEETS_ID = await insertTestIntegration(sql, {
    clientId: CLIENT_ID,
    type: "google_sheets",
    name: "Form Submissions Sheet",
    googleSheets: {
      googleServiceAccountId: OWN_GSA_ID,
      spreadsheetId: "sheet-abc",
      sheetName: "Sheet1",
      columnMapping: ["timestamp", "email", "name"],
      tableAnchor: "A1",
    },
  });
});

beforeAll(async () => {
  if (!DB_URL) return;
  OTHER_GSA_ID = await insertTestGoogleServiceAccount(neon(DB_URL), { clientId: OTHER_CLIENT_ID });
});

afterAll(async () => {
  if (!DB_URL) return;
  const sql = neon(DB_URL);
  await deleteTestClientCascade(sql, CLIENT_ID);
  await deleteTestClientCascade(sql, OTHER_CLIENT_ID);
});

describe("GET /v1/clients/:clientId/integrations/:integrationId", () => {
  it(
    "returns the mailchimp shape with credentials included by default",
    skipIfNoDb(async () => {
      const res = await app.request(`/v1/clients/${CLIENT_ID}/integrations/${MAILCHIMP_ID}`, authed(), TEST_ENV);
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.data).toEqual({
        id: MAILCHIMP_ID,
        clientId: CLIENT_ID,
        type: "mailchimp",
        name: "Main Newsletter List",
        description: null,
        status: "active",
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
        mailchimp: { apiKey: "mc-key-123", listId: "list-123", serverPrefix: "us21" },
      });
    })
  );

  it(
    "returns the google_sheets shape with a nested googleServiceAccount",
    skipIfNoDb(async () => {
      const res = await app.request(`/v1/clients/${CLIENT_ID}/integrations/${GOOGLE_SHEETS_ID}`, authed(), TEST_ENV);
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.data.type).toBe("google_sheets");
      expect(body.data.googleSheets).toEqual({
        spreadsheetId: "sheet-abc",
        sheetName: "Sheet1",
        columnMapping: ["timestamp", "email", "name"],
        tableAnchor: "A1",
        googleServiceAccount: {
          email: "sa@project.iam.gserviceaccount.com",
          key: "-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----",
        },
      });
      expect(body.data.mailchimp).toBeUndefined();
    })
  );

  it(
    "returns 404 when the integration belongs to a different client",
    skipIfNoDb(async () => {
      const res = await app.request(
        `/v1/clients/${OTHER_CLIENT_ID}/integrations/${MAILCHIMP_ID}`,
        authed(),
        TEST_ENV
      );
      expect(res.status).toBe(404);
    })
  );

  it(
    "returns 404 for a malformed (non-uuid) integration id without a 500",
    skipIfNoDb(async () => {
      const res = await app.request(`/v1/clients/${CLIENT_ID}/integrations/not-a-uuid`, authed(), TEST_ENV);
      expect(res.status).toBe(404);
    })
  );

  it("returns 401 without X-API-Key", async () => {
    const res = await app.request(`/v1/clients/${CLIENT_ID}/integrations/${MAILCHIMP_ID}`, {}, TEST_ENV);
    expect(res.status).toBe(401);
  });
});

describe("POST /v1/clients/:clientId/integrations", () => {
  function post(clientId: string, body: unknown, init: RequestInit = authed()) {
    return app.request(
      `/v1/clients/${clientId}/integrations`,
      {
        ...init,
        method: "POST",
        headers: { ...(init.headers as Record<string, string>), "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
      TEST_ENV
    );
  }

  const sheetsBody = (googleServiceAccountId: string) => ({
    type: "google_sheets",
    name: "Created sheet",
    googleServiceAccountId,
    spreadsheetId: "sheet-created",
    columnMapping: ["_timestamp", "email"],
  });

  it(
    "creates a Mailchimp integration and responds with what GET returns",
    skipIfNoDb(async () => {
      const res = await post(CLIENT_ID, {
        type: "mailchimp",
        name: "Created list",
        description: "From the create route",
        apiKey: "mc-created-key-us14",
        listId: "list-created",
        serverPrefix: "us14",
      });
      expect(res.status).toBe(201);
      const created = ((await res.json()) as any).data;
      expect(created).toMatchObject({
        clientId: CLIENT_ID,
        type: "mailchimp",
        name: "Created list",
        description: "From the create route",
        status: "active",
        mailchimp: { apiKey: "mc-created-key-us14", listId: "list-created", serverPrefix: "us14" },
      });

      const got = await app.request(`/v1/clients/${CLIENT_ID}/integrations/${created.id}`, authed(), TEST_ENV);
      expect(((await got.json()) as any).data).toEqual(created);
    })
  );

  it(
    "creates a Google Sheets integration with the client's own service account, defaulting tableAnchor to A1",
    skipIfNoDb(async () => {
      const res = await post(CLIENT_ID, sheetsBody(OWN_GSA_ID));
      expect(res.status).toBe(201);
      const created = ((await res.json()) as any).data;
      expect(created.googleSheets).toMatchObject({
        spreadsheetId: "sheet-created",
        sheetName: null,
        columnMapping: ["_timestamp", "email"],
        tableAnchor: "A1",
        googleServiceAccount: { email: "sa@project.iam.gserviceaccount.com" },
      });

      const got = await app.request(`/v1/clients/${CLIENT_ID}/integrations/${created.id}`, authed(), TEST_ENV);
      expect(((await got.json()) as any).data).toEqual(created);
    })
  );

  it(
    "returns the identical 422 for another client's service account and a nonexistent one, writing nothing",
    skipIfNoDb(async () => {
      const unknown = "00000000-0000-4000-8000-000000000000";
      const other = await post(CLIENT_ID, sheetsBody(OTHER_GSA_ID));
      const missing = await post(CLIENT_ID, sheetsBody(unknown));
      expect(other.status).toBe(422);
      expect(missing.status).toBe(422);

      const otherError = ((await other.json()) as any).error;
      const missingError = ((await missing.json()) as any).error;
      expect(otherError).toEqual({
        code: "VALIDATION_ERROR",
        message: "Referenced records not found for this client",
        details: { googleServiceAccountId: [OTHER_GSA_ID] },
      });
      // Same response apart from the id the caller sent.
      expect({ ...missingError, details: null }).toEqual({ ...otherError, details: null });
      expect(missingError.details).toEqual({ googleServiceAccountId: [unknown] });

      const sql = neon(DB_URL!);
      const rows = await sql`
        SELECT 1 FROM google_sheets_integrations WHERE spreadsheet_id = 'sheet-created'
          AND google_service_account_id IN (${OTHER_GSA_ID}, ${unknown})
      `;
      expect(rows).toHaveLength(0);
    })
  );

  it(
    "maps a same-client FK failure that slips past the pre-check to the same InvalidReferencesError",
    skipIfNoDb(async () => {
      // Calls the repository directly, skipping the service's pre-check, as a
      // race would (the service account checked, then deleted or swapped).
      const db = createDb(DB_URL!);
      const attempt = insertIntegration(db, {
        client_id: CLIENT_ID,
        type: "google_sheets",
        name: "Race",
        description: null,
        google_service_account_id: OTHER_GSA_ID,
        spreadsheet_id: "sheet-race",
        sheet_name: null,
        column_mapping: ["email"],
      });
      await expect(attempt).rejects.toBeInstanceOf(InvalidReferencesError);
      await expect(attempt).rejects.toMatchObject({ details: { googleServiceAccountId: [OTHER_GSA_ID] } });

      // The batch is one transaction: the integration row is gone too.
      const sql = neon(DB_URL!);
      expect(await sql`SELECT 1 FROM integrations WHERE client_id = ${CLIENT_ID} AND name = 'Race'`).toHaveLength(0);
    })
  );

  it(
    "the database itself rejects a Sheets row using another client's service account",
    skipIfNoDb(async () => {
      const sql = neon(DB_URL!);
      // One statement: a fresh integration plus its Sheets row, so the only
      // thing that can fail is the same-client service account FK.
      await expect(sql`
        WITH i AS (
          INSERT INTO integrations (client_id, type, name) VALUES (${CLIENT_ID}, 'google_sheets', 'DB guard') RETURNING id
        )
        INSERT INTO google_sheets_integrations (integration_id, client_id, google_service_account_id, spreadsheet_id, column_mapping)
        SELECT id, ${CLIENT_ID}, ${OTHER_GSA_ID}, 'x', ARRAY['email'] FROM i
      `).rejects.toMatchObject({ code: "23503", constraint: "google_sheets_integrations_client_id_gsa_id_fkey" });
    })
  );

  it(
    "returns 404 for an unknown client",
    skipIfNoDb(async () => {
      const res = await post(`test-integ-missing-${Date.now()}`, {
        type: "mailchimp",
        name: "Orphan",
        apiKey: "k",
        listId: "l",
        serverPrefix: "us1",
      });
      expect(res.status).toBe(404);
    })
  );

  it("returns 422 for an invalid body", async () => {
    const res = await post(CLIENT_ID, { type: "mailchimp", name: "Bad prefix", apiKey: "k", listId: "l", serverPrefix: "us-14" });
    expect(res.status).toBe(422);
  });

  it("returns 401 without X-API-Key", async () => {
    const res = await post(CLIENT_ID, sheetsBody(OWN_GSA_ID), {});
    expect(res.status).toBe(401);
  });
});

