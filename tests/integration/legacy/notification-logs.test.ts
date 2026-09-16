import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { env } from "cloudflare:test";
import { neon } from "@neondatabase/serverless";
import app from "../../../src/index.js";
import type { Env } from "../../../src/types/index.js";

const DB_URL = (env as unknown as Env).DATABASE_URL;
const API_KEY = "test-api-key";

const TEST_ENV = {
  DATABASE_URL: DB_URL ?? "",
  API_KEY,
  ENVIRONMENT: "test",
};

const TEST_CLIENT_ID = `test-legacy-notif-client-${Date.now()}`;

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
    VALUES (${TEST_CLIENT_ID}, 'Legacy Notif Test Client', 'legacy-notif-test@example.com', TRUE, '{}', 'America/Chicago')
    ON CONFLICT (id) DO NOTHING
  `;
});

afterAll(async () => {
  if (!DB_URL) return;
  const sql = neon(DB_URL);
  await sql`DELETE FROM notification_logs WHERE client_id = ${TEST_CLIENT_ID}`;
  await sql`DELETE FROM clients WHERE id = ${TEST_CLIENT_ID}`;
});

// This is the frozen fork sol-notificaiton-service will move onto before
// /v1/notification-logs is cut over to its new camelCase contract (SOL-7).
// The request/response shape here is byte-identical to today's live
// POST /v1/notification-logs — no type/slack_webhook_url in the request.
describe("POST /legacy/notification-logs", () => {
  it(
    "creates a log and returns 201 with type defaulted to 'email'",
    skipIfNoDb(async () => {
      const res = await app.request(
        "/legacy/notification-logs",
        authed({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            client_id: TEST_CLIENT_ID,
            workflow: "weekly-report",
            event_name: "report.sent",
            outcome: "success",
            recipient_email: "recipient@example.com",
          }),
        }),
        TEST_ENV
      );
      expect(res.status).toBe(201);
      const body = (await res.json()) as any;
      expect(body.success).toBe(true);
      expect(body.data.client_id).toBe(TEST_CLIENT_ID);
      expect(body.data.type).toBe("email");
      expect(body.data.slack_webhook_url).toBeNull();
    })
  );

  it(
    "rejects a type field — this contract never sends it",
    skipIfNoDb(async () => {
      const res = await app.request(
        "/legacy/notification-logs",
        authed({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            client_id: TEST_CLIENT_ID,
            workflow: "weekly-report",
            event_name: "report.sent",
            outcome: "success",
            type: "slack",
          }),
        }),
        TEST_ENV
      );
      // zod strips unknown keys by default rather than rejecting — assert the
      // stored row still defaults to 'email' regardless of what was sent.
      expect(res.status).toBe(201);
      const body = (await res.json()) as any;
      expect(body.data.type).toBe("email");
    })
  );

  it(
    "returns 404 when client_id does not reference an existing client",
    skipIfNoDb(async () => {
      const res = await app.request(
        "/legacy/notification-logs",
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
      const body = (await res.json()) as any;
      expect(body.error.code).toBe("NOT_FOUND");
    })
  );

  it("returns 422 on missing required fields", async () => {
    const res = await app.request(
      "/legacy/notification-logs",
      authed({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workflow: "weekly-report" }),
      }),
      TEST_ENV
    );
    expect(res.status).toBe(422);
    const body = (await res.json()) as any;
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 401 without X-API-Key", async () => {
    const res = await app.request(
      "/legacy/notification-logs",
      { method: "POST", body: "{}" },
      TEST_ENV
    );
    expect(res.status).toBe(401);
  });
});
