import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { env } from "cloudflare:test";
import { neon } from "@neondatabase/serverless";
import app from "../../src/index.js";
import type { Env } from "../../src/types/index.js";

const DB_URL = (env as unknown as Env).DATABASE_URL;
const API_KEY = "test-api-key";

const TEST_ENV = {
  DATABASE_URL: DB_URL ?? "",
  API_KEY,
  ENVIRONMENT: "test",
};

const TEST_CLIENT_ID = `test-notif-client-${Date.now()}`;
let TEST_LOG_ID: number;

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
  await sql`
    INSERT INTO clients (id, name, email, active, settings, timezone)
    VALUES (${TEST_CLIENT_ID}, 'Notif Test Client', 'notif-test@example.com', TRUE, '{}', 'America/Chicago')
    ON CONFLICT (id) DO NOTHING
  `;
  const rows = await sql`
    INSERT INTO notification_logs (client_id, workflow, event_name, outcome, recipient_email)
    VALUES (${TEST_CLIENT_ID}, 'weekly-report', 'report.sent', 'success', 'seeded@example.com')
    RETURNING id
  `;
  TEST_LOG_ID = Number((rows[0] as { id: string | number }).id);
});

afterAll(async () => {
  if (!DB_URL) return;
  const sql = neon(DB_URL);
  await sql`DELETE FROM notification_logs WHERE client_id = ${TEST_CLIENT_ID}`;
  await sql`DELETE FROM clients WHERE id = ${TEST_CLIENT_ID}`;
});

describe("GET /v1/notification-logs", () => {
  it(
    "returns 200 with a list including the seeded log",
    skipIfNoDb(async () => {
      const res = await app.request(
        `/v1/notification-logs?client_id=${TEST_CLIENT_ID}`,
        authed(),
        TEST_ENV
      );
      expect(res.status).toBe(200);
      const body = await res.json() as any;
      expect(body.success).toBe(true);
      expect(body.data.some((log: any) => log.id === TEST_LOG_ID)).toBe(true);
    })
  );

  it(
    "filters by client_id",
    skipIfNoDb(async () => {
      const res = await app.request(
        `/v1/notification-logs?client_id=${TEST_CLIENT_ID}`,
        authed(),
        TEST_ENV
      );
      const body = await res.json() as any;
      for (const log of body.data) {
        expect(log.client_id).toBe(TEST_CLIENT_ID);
      }
    })
  );

  it("returns 401 without X-API-Key", async () => {
    const res = await app.request("/v1/notification-logs", {}, TEST_ENV);
    expect(res.status).toBe(401);
  });

  it("returns 422 on invalid limit", async () => {
    const res = await app.request(
      "/v1/notification-logs?limit=0",
      authed(),
      TEST_ENV
    );
    expect(res.status).toBe(422);
  });

  it("returns 422 on invalid from date", async () => {
    const res = await app.request(
      "/v1/notification-logs?from=not-a-date",
      authed(),
      TEST_ENV
    );
    expect(res.status).toBe(422);
  });

  it("returns 422 on invalid to date", async () => {
    const res = await app.request(
      "/v1/notification-logs?to=not-a-date",
      authed(),
      TEST_ENV
    );
    expect(res.status).toBe(422);
  });
});

describe("GET /v1/notification-logs/:id", () => {
  it(
    "returns 200 for an existing log",
    skipIfNoDb(async () => {
      const res = await app.request(
        `/v1/notification-logs/${TEST_LOG_ID}`,
        authed(),
        TEST_ENV
      );
      expect(res.status).toBe(200);
      const body = await res.json() as any;
      expect(body.success).toBe(true);
      expect(body.data.id).toBe(TEST_LOG_ID);
    })
  );

  it(
    "returns 404 for a non-existent log",
    skipIfNoDb(async () => {
      const res = await app.request(
        "/v1/notification-logs/999999999",
        authed(),
        TEST_ENV
      );
      expect(res.status).toBe(404);
      const body = await res.json() as any;
      expect(body.error.code).toBe("NOT_FOUND");
    })
  );

  it("returns 422 for a non-numeric id", async () => {
    const res = await app.request(
      "/v1/notification-logs/not-a-number",
      authed(),
      TEST_ENV
    );
    expect(res.status).toBe(422);
  });

  it("returns 401 without X-API-Key", async () => {
    const res = await app.request(`/v1/notification-logs/${TEST_LOG_ID}`, {}, TEST_ENV);
    expect(res.status).toBe(401);
  });
});

describe("POST /v1/notification-logs", () => {
  it(
    "creates a log and returns 201",
    skipIfNoDb(async () => {
      const res = await app.request(
        "/v1/notification-logs",
        authed({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            client_id: TEST_CLIENT_ID,
            workflow: "weekly-report",
            event_name: "report.sent",
            outcome: "success",
          }),
        }),
        TEST_ENV
      );
      expect(res.status).toBe(201);
      const body = await res.json() as any;
      expect(body.success).toBe(true);
      expect(body.data.client_id).toBe(TEST_CLIENT_ID);
    })
  );

  it(
    "returns 404 when client_id does not reference an existing client",
    skipIfNoDb(async () => {
      const res = await app.request(
        "/v1/notification-logs",
        authed({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            client_id: "does-not-exist",
            workflow: "weekly-report",
            event_name: "report.sent",
            outcome: "success",
          }),
        }),
        TEST_ENV
      );
      expect(res.status).toBe(404);
      const body = await res.json() as any;
      expect(body.error.code).toBe("NOT_FOUND");
    })
  );

  it("returns 422 on missing required fields", async () => {
    const res = await app.request(
      "/v1/notification-logs",
      authed({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workflow: "weekly-report" }),
      }),
      TEST_ENV
    );
    expect(res.status).toBe(422);
    const body = await res.json() as any;
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 401 without X-API-Key", async () => {
    const res = await app.request(
      "/v1/notification-logs",
      { method: "POST", body: "{}" },
      TEST_ENV
    );
    expect(res.status).toBe(401);
  });
});
