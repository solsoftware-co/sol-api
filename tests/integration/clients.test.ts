import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { env } from "cloudflare:test";
import { neon } from "@neondatabase/serverless";
import app from "../../src/index.js";
import type { Env } from "../../src/types/index.js";
import { insertTestClient, deleteTestClientCascade } from "../helpers/db-fixtures.js";

const DB_URL = (env as unknown as Env).DATABASE_URL;
const API_KEY = "test-api-key";

const TEST_ENV = {
  DATABASE_URL: DB_URL ?? "",
  API_KEY,
  ENVIRONMENT: "test",
};

const TEST_CLIENT_ID = `test-client-${Date.now()}`;
const INACTIVE_CLIENT_ID = `test-client-inactive-${Date.now()}`;

function authed(init: RequestInit = {}): RequestInit {
  return {
    ...init,
    headers: { ...(init.headers as Record<string, string>), "X-API-Key": API_KEY },
  };
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
  await insertTestClient(sql, { id: TEST_CLIENT_ID, name: "Test Client", email: "test@example.com" });
  await insertTestClient(sql, { id: INACTIVE_CLIENT_ID, name: "Inactive Client", active: false });
});

afterAll(async () => {
  if (!DB_URL) return;
  const sql = neon(DB_URL);
  await deleteTestClientCascade(sql, TEST_CLIENT_ID);
  await deleteTestClientCascade(sql, INACTIVE_CLIENT_ID);
});

// This route was rebuilt for SOL-7 into a minimal, camelCase-only resource.
// The old full snake_case contract (list/POST/PATCH included) lives on,
// unchanged, at /legacy/clients — see tests/integration/legacy/clients.test.ts.
describe("GET /v1/clients/:clientId", () => {
  it(
    "returns 200 with the minimal camelCase shape",
    skipIfNoDb(async () => {
      const res = await app.request(`/v1/clients/${TEST_CLIENT_ID}`, authed(), TEST_ENV);
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.success).toBe(true);
      expect(body.data).toEqual({
        id: TEST_CLIENT_ID,
        name: "Test Client",
        email: "test@example.com",
        active: true,
        settings: {},
        timezone: "America/Chicago",
        createdAt: expect.any(String),
      });
    })
  );

  it(
    "never includes credentials or site data",
    skipIfNoDb(async () => {
      const res = await app.request(`/v1/clients/${TEST_CLIENT_ID}`, authed(), TEST_ENV);
      const body = (await res.json()) as any;
      for (const key of [
        "googleServiceAccountKey",
        "slackWebhookUrl",
        "ga4PropertyId",
        "sanityProjectId",
        "githubRepo",
      ]) {
        expect(body.data).not.toHaveProperty(key);
      }
    })
  );

  it(
    "ignores ?include= (no gating on this route)",
    skipIfNoDb(async () => {
      const res = await app.request(
        `/v1/clients/${TEST_CLIENT_ID}?include=anything`,
        authed(),
        TEST_ENV
      );
      expect(res.status).toBe(200);
    })
  );

  it(
    "returns 404 for an inactive client",
    skipIfNoDb(async () => {
      const res = await app.request(`/v1/clients/${INACTIVE_CLIENT_ID}`, authed(), TEST_ENV);
      expect(res.status).toBe(404);
    })
  );

  it(
    "returns 404 for a non-existent client",
    skipIfNoDb(async () => {
      const res = await app.request("/v1/clients/does-not-exist", authed(), TEST_ENV);
      expect(res.status).toBe(404);
      const body = (await res.json()) as any;
      expect(body.error.code).toBe("NOT_FOUND");
    })
  );

  it("returns 401 without X-API-Key", async () => {
    const res = await app.request(`/v1/clients/${TEST_CLIENT_ID}`, {}, TEST_ENV);
    expect(res.status).toBe(401);
  });
});

describe("GET /v1/clients (list) / POST /v1/clients / PATCH /v1/clients/:id", () => {
  it("no longer exist on /v1 — moved to /legacy/clients", async () => {
    const [listRes, postRes, patchRes] = await Promise.all([
      app.request("/v1/clients", authed(), TEST_ENV),
      app.request("/v1/clients", authed({ method: "POST", body: "{}" }), TEST_ENV),
      app.request(`/v1/clients/${TEST_CLIENT_ID}`, authed({ method: "PATCH", body: "{}" }), TEST_ENV),
    ]);
    expect(listRes.status).toBe(404);
    expect(postRes.status).toBe(404);
    expect(patchRes.status).toBe(404);
  });
});
