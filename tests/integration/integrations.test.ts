import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { env } from "cloudflare:test";
import { neon } from "@neondatabase/serverless";
import app from "../../src/index.js";
import type { Env } from "../../src/types/index.js";
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

  const gsaId = await insertTestGoogleServiceAccount(sql, {
    clientId: CLIENT_ID,
    email: "sa@project.iam.gserviceaccount.com",
    key: "-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----",
  });
  GOOGLE_SHEETS_ID = await insertTestIntegration(sql, {
    clientId: CLIENT_ID,
    type: "google_sheets",
    name: "Form Submissions Sheet",
    googleSheets: {
      googleServiceAccountId: gsaId,
      spreadsheetId: "sheet-abc",
      sheetName: "Sheet1",
      columnMapping: ["timestamp", "email", "name"],
      tableAnchor: "A1",
    },
  });
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
