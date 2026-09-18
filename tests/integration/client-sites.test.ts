import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { env } from "cloudflare:test";
import { neon } from "@neondatabase/serverless";
import app from "../../src/index.js";
import type { Env } from "../../src/types/index.js";
import {
  insertTestClient,
  insertTestGoogleServiceAccount,
  insertTestSite,
  deleteTestClientCascade,
} from "../helpers/db-fixtures.js";

const DB_URL = (env as unknown as Env).DATABASE_URL;
const API_KEY = "test-api-key";
const TEST_ENV = { DATABASE_URL: DB_URL ?? "", API_KEY, ENVIRONMENT: "test" };

const CLIENT_ID = `test-clientsite-client-${Date.now()}`;
const OTHER_CLIENT_ID = `test-clientsite-other-${Date.now()}`;
let SITE_WITH_GSA_ID: string;
let SITE_WITHOUT_GSA_ID: string;

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

  const gsaId = await insertTestGoogleServiceAccount(sql, {
    clientId: CLIENT_ID,
    email: "sa@project.iam.gserviceaccount.com",
    key: "-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----",
  });

  SITE_WITH_GSA_ID = await insertTestSite(sql, {
    clientId: CLIENT_ID,
    name: "Acme Corp",
    domain: "acme.com",
    ga4PropertyId: "111222333",
    ga4ServiceAccountId: gsaId,
  });

  SITE_WITHOUT_GSA_ID = await insertTestSite(sql, {
    clientId: CLIENT_ID,
    name: "No GSA Site",
  });
});

afterAll(async () => {
  if (!DB_URL) return;
  const sql = neon(DB_URL);
  await deleteTestClientCascade(sql, CLIENT_ID);
  await deleteTestClientCascade(sql, OTHER_CLIENT_ID);
});

describe("GET /v1/clients/:clientId/sites/:siteId", () => {
  it(
    "returns the base camelCase shape without ?include=",
    skipIfNoDb(async () => {
      const res = await app.request(`/v1/clients/${CLIENT_ID}/sites/${SITE_WITH_GSA_ID}`, authed(), TEST_ENV);
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.data).toEqual({
        id: SITE_WITH_GSA_ID,
        clientId: CLIENT_ID,
        name: "Acme Corp",
        description: null,
        domain: "acme.com",
        stagingDomain: null,
        ga4PropertyId: "111222333",
        analyticsRecipients: [],
        analyticsReportsEnabled: true,
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      });
      expect(body.data.googleServiceAccount).toBeUndefined();
    })
  );

  it(
    "adds googleServiceAccount only with ?include=googleServiceAccount",
    skipIfNoDb(async () => {
      const res = await app.request(
        `/v1/clients/${CLIENT_ID}/sites/${SITE_WITH_GSA_ID}?include=googleServiceAccount`,
        authed(),
        TEST_ENV
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.data.googleServiceAccount).toEqual({
        email: "sa@project.iam.gserviceaccount.com",
        key: "-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----",
      });
    })
  );

  it(
    "?include=googleServiceAccount on a site with no linked service account returns 200 without the field",
    skipIfNoDb(async () => {
      const res = await app.request(
        `/v1/clients/${CLIENT_ID}/sites/${SITE_WITHOUT_GSA_ID}?include=googleServiceAccount`,
        authed(),
        TEST_ENV
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.data.googleServiceAccount).toBeUndefined();
    })
  );

  it(
    "returns 404 when the site belongs to a different client",
    skipIfNoDb(async () => {
      const res = await app.request(
        `/v1/clients/${OTHER_CLIENT_ID}/sites/${SITE_WITH_GSA_ID}`,
        authed(),
        TEST_ENV
      );
      expect(res.status).toBe(404);
    })
  );

  it(
    "returns 404 for a malformed (non-uuid) site id without a 500",
    skipIfNoDb(async () => {
      const res = await app.request(`/v1/clients/${CLIENT_ID}/sites/not-a-uuid`, authed(), TEST_ENV);
      expect(res.status).toBe(404);
    })
  );

  it("returns 401 without X-API-Key", async () => {
    const res = await app.request(`/v1/clients/${CLIENT_ID}/sites/${SITE_WITH_GSA_ID}`, {}, TEST_ENV);
    expect(res.status).toBe(401);
  });
});
