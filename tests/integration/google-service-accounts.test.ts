import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { env } from "cloudflare:test";
import { neon } from "@neondatabase/serverless";
import app from "../../src/index.js";
import type { Env } from "../../src/types/index.js";
import { createDb } from "../../src/lib/db.js";
import { findMissingIds } from "../../src/repositories/references.js";
import { google_service_accounts } from "../../src/lib/schema.js";
import { insertTestClient, insertTestGoogleServiceAccount, deleteTestClientCascade } from "../helpers/db-fixtures.js";

const DB_URL = (env as unknown as Env).DATABASE_URL;
const API_KEY = "test-api-key";
const TEST_ENV = { DATABASE_URL: DB_URL ?? "", API_KEY, ENVIRONMENT: "test" };

const CLIENT_ID = `test-gsa-client-${Date.now()}`;
const OTHER_CLIENT_ID = `test-gsa-other-${Date.now()}`;
const KEY = "-----BEGIN PRIVATE KEY-----\ncreated\n-----END PRIVATE KEY-----";
let OWN_ID: string;
let OTHER_ID: string;

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

function post(clientId: string, body: unknown, init: RequestInit = authed()) {
  return app.request(
    `/v1/clients/${clientId}/google-service-accounts`,
    {
      ...init,
      method: "POST",
      headers: { ...(init.headers as Record<string, string>), "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    TEST_ENV
  );
}

beforeAll(async () => {
  if (!DB_URL) return;
  const sql = neon(DB_URL);
  await insertTestClient(sql, { id: CLIENT_ID });
  await insertTestClient(sql, { id: OTHER_CLIENT_ID });
  OWN_ID = await insertTestGoogleServiceAccount(sql, { clientId: CLIENT_ID });
  OTHER_ID = await insertTestGoogleServiceAccount(sql, { clientId: OTHER_CLIENT_ID });
});

afterAll(async () => {
  if (!DB_URL) return;
  const sql = neon(DB_URL);
  await deleteTestClientCascade(sql, CLIENT_ID);
  await deleteTestClientCascade(sql, OTHER_CLIENT_ID);
});

describe("POST /v1/clients/:clientId/google-service-accounts", () => {
  it(
    "creates a service account, stores the key, and never returns it",
    skipIfNoDb(async () => {
      const res = await post(CLIENT_ID, {
        name: "Sheets writer",
        description: "For form submissions",
        email: "writer@project.iam.gserviceaccount.com",
        key: KEY,
      });
      expect(res.status).toBe(201);
      const created = ((await res.json()) as any).data;
      expect(created).toEqual({
        id: expect.any(String),
        clientId: CLIENT_ID,
        name: "Sheets writer",
        description: "For form submissions",
        email: "writer@project.iam.gserviceaccount.com",
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      });
      expect(JSON.stringify(created)).not.toContain("PRIVATE KEY");

      const sql = neon(DB_URL!);
      const rows = await sql`SELECT key FROM google_service_accounts WHERE id = ${created.id}`;
      expect(rows[0]).toEqual({ key: KEY });

      const got = await app.request(
        `/v1/clients/${CLIENT_ID}/google-service-accounts/${created.id}`,
        authed(),
        TEST_ENV
      );
      expect(((await got.json()) as any).data).toEqual(created);
    })
  );

  it(
    "returns 404 for an unknown client",
    skipIfNoDb(async () => {
      const res = await post(`test-gsa-missing-${Date.now()}`, { name: "x", email: "x@p.iam.gserviceaccount.com", key: KEY });
      expect(res.status).toBe(404);
    })
  );

  it("returns 422 for a missing key or an invalid email", async () => {
    expect((await post(CLIENT_ID, { name: "x", email: "x@p.iam.gserviceaccount.com" })).status).toBe(422);
    expect((await post(CLIENT_ID, { name: "x", email: "not-an-email", key: KEY })).status).toBe(422);
  });

  it("returns 401 without X-API-Key", async () => {
    const res = await post(CLIENT_ID, { name: "x", email: "x@p.iam.gserviceaccount.com", key: KEY }, {});
    expect(res.status).toBe(401);
  });
});

describe("GET /v1/clients/:clientId/google-service-accounts/:id", () => {
  it(
    "returns 404 for another client's service account",
    skipIfNoDb(async () => {
      const res = await app.request(`/v1/clients/${CLIENT_ID}/google-service-accounts/${OTHER_ID}`, authed(), TEST_ENV);
      expect(res.status).toBe(404);
    })
  );

  it("returns 404 for a non-UUID id", async () => {
    const res = await app.request(`/v1/clients/${CLIENT_ID}/google-service-accounts/nope`, authed(), TEST_ENV);
    expect(res.status).toBe(404);
  });
});

describe("findMissingIds", () => {
  const UNKNOWN = "00000000-0000-4000-8000-000000000000";

  it(
    "returns nothing when every id is the client's",
    skipIfNoDb(async () => {
      expect(await findMissingIds(createDb(DB_URL!), google_service_accounts, CLIENT_ID, [OWN_ID])).toEqual([]);
    })
  );

  it(
    "treats another client's id exactly like a nonexistent one",
    skipIfNoDb(async () => {
      const missing = await findMissingIds(createDb(DB_URL!), google_service_accounts, CLIENT_ID, [
        OTHER_ID,
        OWN_ID,
        UNKNOWN,
      ]);
      expect(missing).toEqual([OTHER_ID, UNKNOWN]);
    })
  );

  it(
    "dedupes, matches uppercase ids, and reports non-UUIDs as missing",
    skipIfNoDb(async () => {
      const missing = await findMissingIds(createDb(DB_URL!), google_service_accounts, CLIENT_ID, [
        UNKNOWN,
        UNKNOWN,
        OWN_ID.toUpperCase(),
        "not-a-uuid",
      ]);
      expect(missing).toEqual([UNKNOWN, "not-a-uuid"]);
    })
  );

  it(
    "returns nothing for an empty list without querying",
    skipIfNoDb(async () => {
      expect(await findMissingIds(createDb(DB_URL!), google_service_accounts, CLIENT_ID, [])).toEqual([]);
    })
  );
});
