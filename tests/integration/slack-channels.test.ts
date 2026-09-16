import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { env } from "cloudflare:test";
import { neon } from "@neondatabase/serverless";
import app from "../../src/index.js";
import type { Env } from "../../src/types/index.js";
import {
  insertTestClient,
  insertTestSlackChannel,
  deleteTestClientCascade,
} from "../helpers/db-fixtures.js";

const DB_URL = (env as unknown as Env).DATABASE_URL;
const API_KEY = "test-api-key";
const TEST_ENV = { DATABASE_URL: DB_URL ?? "", API_KEY, ENVIRONMENT: "test" };

const CLIENT_ID = `test-slackch-client-${Date.now()}`;
const OTHER_CLIENT_ID = `test-slackch-other-${Date.now()}`;
let CHANNEL_ID: string;

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
  CHANNEL_ID = await insertTestSlackChannel(sql, {
    clientId: CLIENT_ID,
    name: "Sales Alerts",
    description: "Inbound leads",
    webhookUrl: "https://hooks.slack.com/services/T000/B000/XXXX",
  });
});

afterAll(async () => {
  if (!DB_URL) return;
  const sql = neon(DB_URL);
  await deleteTestClientCascade(sql, CLIENT_ID);
  await deleteTestClientCascade(sql, OTHER_CLIENT_ID);
});

describe("GET /v1/clients/:clientId/slack-channels/:channelId", () => {
  it(
    "returns 200 with the camelCase shape, webhook always present",
    skipIfNoDb(async () => {
      const res = await app.request(`/v1/clients/${CLIENT_ID}/slack-channels/${CHANNEL_ID}`, authed(), TEST_ENV);
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.data).toEqual({
        id: CHANNEL_ID,
        clientId: CLIENT_ID,
        name: "Sales Alerts",
        description: "Inbound leads",
        webhookUrl: "https://hooks.slack.com/services/T000/B000/XXXX",
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      });
    })
  );

  it(
    "returns 404 when the channel belongs to a different client",
    skipIfNoDb(async () => {
      const res = await app.request(
        `/v1/clients/${OTHER_CLIENT_ID}/slack-channels/${CHANNEL_ID}`,
        authed(),
        TEST_ENV
      );
      expect(res.status).toBe(404);
    })
  );

  it(
    "returns 404 for a malformed (non-uuid) channel id without a 500",
    skipIfNoDb(async () => {
      const res = await app.request(`/v1/clients/${CLIENT_ID}/slack-channels/not-a-uuid`, authed(), TEST_ENV);
      expect(res.status).toBe(404);
    })
  );

  it(
    "returns 404 for a well-formed but non-existent channel id",
    skipIfNoDb(async () => {
      const res = await app.request(
        `/v1/clients/${CLIENT_ID}/slack-channels/00000000-0000-0000-0000-000000000000`,
        authed(),
        TEST_ENV
      );
      expect(res.status).toBe(404);
    })
  );

  it("returns 401 without X-API-Key", async () => {
    const res = await app.request(`/v1/clients/${CLIENT_ID}/slack-channels/${CHANNEL_ID}`, {}, TEST_ENV);
    expect(res.status).toBe(401);
  });
});
