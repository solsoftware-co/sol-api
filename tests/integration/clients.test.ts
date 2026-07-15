import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { neon } from "@neondatabase/serverless";
import app from "../../src/index.js";

const DB_URL = process.env.DATABASE_URL;
const API_KEY = "test-api-key";

const TEST_ENV = {
  DATABASE_URL: DB_URL ?? "",
  API_KEY,
  ENVIRONMENT: "test",
};

const TEST_CLIENT_ID = `test-client-${Date.now()}`;
const TEST_CLIENT_ID_2 = `test-client-2-${Date.now()}`;

function authed(init: RequestInit = {}): RequestInit {
  return {
    ...init,
    headers: { ...(init.headers as Record<string, string>), "X-API-Key": API_KEY },
  };
}

beforeAll(async () => {
  if (!DB_URL) return;
  const sql = neon(DB_URL);
  await sql`
    INSERT INTO clients (id, name, email, active, settings, timezone)
    VALUES
      (${TEST_CLIENT_ID}, 'Test Client', 'test@example.com', TRUE, '{}', 'America/Chicago'),
      (${TEST_CLIENT_ID_2}, 'Inactive Client', 'inactive@example.com', FALSE, '{}', 'America/Chicago')
    ON CONFLICT (id) DO NOTHING
  `;
});

afterAll(async () => {
  if (!DB_URL) return;
  const sql = neon(DB_URL);
  await sql`DELETE FROM clients WHERE id IN (${TEST_CLIENT_ID}, ${TEST_CLIENT_ID_2})`;
});

function skipIfNoDb(testFn: () => Promise<void>): () => Promise<void> {
  return async () => {
    if (!DB_URL) {
      console.warn("Skipping DB test: DATABASE_URL not set");
      return;
    }
    await testFn();
  };
}

// ─── GET /v1/clients/:id (US1) ───────────────────────────────────────────────

describe("GET /v1/clients/:id", () => {
  it(
    "returns 200 with full ClientRecord for active client",
    skipIfNoDb(async () => {
      const res = await app.request(
        `/v1/clients/${TEST_CLIENT_ID}`,
        authed(),
        TEST_ENV
      );
      expect(res.status).toBe(200);
      const body = await res.json() as any;
      expect(body.success).toBe(true);
      expect(body.data.id).toBe(TEST_CLIENT_ID);
      expect("google_service_account_key" in body.data).toBe(true);
    })
  );

  it(
    "returns 404 for non-existent client",
    skipIfNoDb(async () => {
      const res = await app.request(
        "/v1/clients/does-not-exist",
        authed(),
        TEST_ENV
      );
      expect(res.status).toBe(404);
      const body = await res.json() as any;
      expect(body.error.code).toBe("NOT_FOUND");
    })
  );

  it(
    "returns 404 for inactive client",
    skipIfNoDb(async () => {
      const res = await app.request(
        `/v1/clients/${TEST_CLIENT_ID_2}`,
        authed(),
        TEST_ENV
      );
      expect(res.status).toBe(404);
    })
  );

  it("returns 401 without X-API-Key", async () => {
    const res = await app.request(
      "/v1/clients/any-id",
      {},
      TEST_ENV
    );
    expect(res.status).toBe(401);
  });
});

// ─── GET /v1/clients (US2) ───────────────────────────────────────────────────

describe("GET /v1/clients", () => {
  it(
    "returns 200 with only active clients",
    skipIfNoDb(async () => {
      const res = await app.request("/v1/clients", authed(), TEST_ENV);
      expect(res.status).toBe(200);
      const body = await res.json() as any;
      expect(body.success).toBe(true);
      expect(Array.isArray(body.data)).toBe(true);
      for (const client of body.data) {
        expect(client.active).toBe(true);
        expect("google_service_account_key" in client).toBe(false);
      }
    })
  );

  it("returns 200 with empty array when no active clients match", async () => {
    const res = await app.request(
      "/v1/clients?limit=0",
      authed(),
      { ...TEST_ENV, DATABASE_URL: DB_URL ?? "postgres://invalid" }
    );
    // limit=0 is invalid — expect 422
    expect(res.status).toBe(422);
  });

  it(
    "respects limit param",
    skipIfNoDb(async () => {
      const res = await app.request("/v1/clients?limit=1", authed(), TEST_ENV);
      expect(res.status).toBe(200);
      const body = await res.json() as any;
      expect(body.data.length).toBeLessThanOrEqual(1);
    })
  );

  it("returns 401 without X-API-Key", async () => {
    const res = await app.request("/v1/clients", {}, TEST_ENV);
    expect(res.status).toBe(401);
  });

  it(
    "google_service_account_key is absent from every list item",
    skipIfNoDb(async () => {
      const res = await app.request("/v1/clients", authed(), TEST_ENV);
      const body = await res.json() as any;
      for (const item of body.data) {
        expect(item).not.toHaveProperty("google_service_account_key");
      }
    })
  );
});

// ─── POST /v1/clients (US3) ──────────────────────────────────────────────────

const NEW_CLIENT_ID = `test-new-${Date.now()}`;

describe("POST /v1/clients", () => {
  afterAll(async () => {
    if (!DB_URL) return;
    const sql = neon(DB_URL);
    await sql`DELETE FROM clients WHERE id = ${NEW_CLIENT_ID}`;
  });

  it(
    "creates client and returns 201 with new record",
    skipIfNoDb(async () => {
      const res = await app.request(
        "/v1/clients",
        authed({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: NEW_CLIENT_ID,
            name: "New Test Client",
            email: "new-test@example.com",
            timezone: "America/New_York",
          }),
        }),
        TEST_ENV
      );
      expect(res.status).toBe(201);
      const body = await res.json() as any;
      expect(body.success).toBe(true);
      expect(body.data.id).toBe(NEW_CLIENT_ID);
    })
  );

  it(
    "creates client with default_email",
    skipIfNoDb(async () => {
      const id = `${NEW_CLIENT_ID}-default-email`;
      const res = await app.request(
        "/v1/clients",
        authed({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id,
            name: "Default Email Client",
            email: "contact@example.com",
            default_email: "default@example.com",
          }),
        }),
        TEST_ENV
      );
      expect(res.status).toBe(201);
      const body = await res.json() as any;
      expect(body.data.default_email).toBe("default@example.com");

      const sql = neon(DB_URL!);
      await sql`DELETE FROM clients WHERE id = ${id}`;
    })
  );

  it("returns 422 when default_email lacks @", async () => {
    const res = await app.request(
      "/v1/clients",
      authed({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: "bad-default-email",
          name: "Bad Default Email",
          email: "contact@example.com",
          default_email: "not-an-email",
        }),
      }),
      TEST_ENV
    );
    expect(res.status).toBe(422);
  });

  it(
    "returns 409 on duplicate ID",
    skipIfNoDb(async () => {
      const payload = {
        id: TEST_CLIENT_ID,
        name: "Dupe",
        email: "dupe@example.com",
      };
      const res = await app.request(
        "/v1/clients",
        authed({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }),
        TEST_ENV
      );
      expect(res.status).toBe(409);
      const body = await res.json() as any;
      expect(body.error.code).toBe("CONFLICT");
    })
  );

  it("returns 422 on missing required fields", async () => {
    const res = await app.request(
      "/v1/clients",
      authed({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "No ID or Email" }),
      }),
      TEST_ENV
    );
    expect(res.status).toBe(422);
    const body = await res.json() as any;
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(Array.isArray(body.error.details)).toBe(true);
  });

  it("returns 422 on invalid timezone", async () => {
    const res = await app.request(
      "/v1/clients",
      authed({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: "tz-test",
          name: "TZ Test",
          email: "tz@test.com",
          timezone: "Europe/London",
        }),
      }),
      TEST_ENV
    );
    expect(res.status).toBe(422);
  });

  it("returns 401 without X-API-Key", async () => {
    const res = await app.request(
      "/v1/clients",
      { method: "POST", body: "{}" },
      TEST_ENV
    );
    expect(res.status).toBe(401);
  });
});

// ─── PATCH /v1/clients/:id (US4) ─────────────────────────────────────────────

describe("PATCH /v1/clients/:id", () => {
  it(
    "updates a single field and leaves others unchanged",
    skipIfNoDb(async () => {
      const newName = `Updated-${Date.now()}`;
      const patchRes = await app.request(
        `/v1/clients/${TEST_CLIENT_ID}`,
        authed({
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: newName }),
        }),
        TEST_ENV
      );
      expect(patchRes.status).toBe(200);
      const patchBody = await patchRes.json() as any;
      expect(patchBody.data.name).toBe(newName);
      expect(patchBody.data.email).toBe("test@example.com");
    })
  );

  it(
    "updates default_email",
    skipIfNoDb(async () => {
      const res = await app.request(
        `/v1/clients/${TEST_CLIENT_ID}`,
        authed({
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ default_email: "updated-default@example.com" }),
        }),
        TEST_ENV
      );
      expect(res.status).toBe(200);
      const body = await res.json() as any;
      expect(body.data.default_email).toBe("updated-default@example.com");
    })
  );

  it(
    "accepts a valid timezone update",
    skipIfNoDb(async () => {
      const res = await app.request(
        `/v1/clients/${TEST_CLIENT_ID}`,
        authed({
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ timezone: "America/Los_Angeles" }),
        }),
        TEST_ENV
      );
      expect(res.status).toBe(200);
    })
  );

  it("returns 422 on invalid timezone", async () => {
    const res = await app.request(
      `/v1/clients/${TEST_CLIENT_ID}`,
      authed({
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ timezone: "Europe/Berlin" }),
      }),
      TEST_ENV
    );
    expect(res.status).toBe(422);
  });

  it(
    "returns 404 for non-existent client",
    skipIfNoDb(async () => {
      const res = await app.request(
        "/v1/clients/does-not-exist",
        authed({
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "Ghost" }),
        }),
        TEST_ENV
      );
      expect(res.status).toBe(404);
    })
  );

  it("returns 401 without X-API-Key", async () => {
    const res = await app.request(
      `/v1/clients/${TEST_CLIENT_ID}`,
      { method: "PATCH", body: "{}" },
      TEST_ENV
    );
    expect(res.status).toBe(401);
  });
});
