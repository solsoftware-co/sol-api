import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { env } from "cloudflare:test";
import { neon } from "@neondatabase/serverless";
import app from "../../src/index.js";
import type { Env } from "../../src/types/index.js";
import { insertTestClient, insertTestChannel, deleteTestClientCascade } from "../helpers/db-fixtures.js";

const DB_URL = (env as unknown as Env).DATABASE_URL;
const API_KEY = "test-api-key";
const TEST_ENV = { DATABASE_URL: DB_URL ?? "", API_KEY, ENVIRONMENT: "test" };

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

const CLIENT_ID = `test-channels-client-${Date.now()}`;
const OTHER_CLIENT_ID = `test-channels-other-${Date.now()}`;
let EMAIL_ID: string;
let SLACK_ID: string;
let OTHER_ID: string;

beforeAll(async () => {
  if (!DB_URL) return;
  const sql = neon(DB_URL);
  await insertTestClient(sql, { id: CLIENT_ID });
  await insertTestClient(sql, { id: OTHER_CLIENT_ID });
  EMAIL_ID = await insertTestChannel(sql, {
    clientId: CLIENT_ID,
    type: "email",
    name: "Sales team",
    description: "Inbound leads",
    emailAddresses: ["a@acme.com", "b@acme.com"],
  });
  SLACK_ID = await insertTestChannel(sql, {
    clientId: CLIENT_ID,
    type: "slack",
    name: "#leads",
    webhookUrl: "https://hooks.slack.com/services/SECRET",
  });
  OTHER_ID = await insertTestChannel(sql, { clientId: OTHER_CLIENT_ID, type: "email", name: "Other team" });
});

afterAll(async () => {
  if (!DB_URL) return;
  const sql = neon(DB_URL);
  await deleteTestClientCascade(sql, CLIENT_ID);
  await deleteTestClientCascade(sql, OTHER_CLIENT_ID);
});

describe("GET /v1/clients/:clientId/channels", () => {
  it(
    "lists the client's channels with their email addresses and Slack webhooks",
    skipIfNoDb(async () => {
      const res = await app.request(`/v1/clients/${CLIENT_ID}/channels`, authed(), TEST_ENV);
      expect(res.status).toBe(200);
      const text = await res.text();
      expect(text).not.toContain("SECRET");
      const body = JSON.parse(text);
      const email = body.data.find((c: any) => c.id === EMAIL_ID);
      expect(email).toEqual({
        id: EMAIL_ID,
        clientId: CLIENT_ID,
        type: "email",
        name: "Sales team",
        description: "Inbound leads",
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
        email: { emailAddresses: ["a@acme.com", "b@acme.com"] },
      });
      const slack = body.data.find((c: any) => c.id === SLACK_ID);
      expect(slack.type).toBe("slack");
      expect(slack.slack).toEqual({ webhookUrl: "https://hooks.slack.com/services/SECRET" });
      expect(slack).not.toHaveProperty("email");
      expect(body.data.some((c: any) => c.id === OTHER_ID)).toBe(false);
    })
  );

  it(
    "?ids= returns only the requested channels; other clients' and unknown ids are absent",
    skipIfNoDb(async () => {
      const ids = [EMAIL_ID, OTHER_ID, "00000000-0000-0000-0000-000000000000"].join(",");
      const res = await app.request(`/v1/clients/${CLIENT_ID}/channels?ids=${ids}`, authed(), TEST_ENV);
      const body = (await res.json()) as any;
      expect(body.data.map((c: any) => c.id)).toEqual([EMAIL_ID]);
    })
  );

  it("returns 422 when ?ids= contains a non-UUID", async () => {
    const res = await app.request(`/v1/clients/${CLIENT_ID}/channels?ids=abc`, authed(), TEST_ENV);
    expect(res.status).toBe(422);
  });

  it("returns 401 without X-API-Key", async () => {
    const res = await app.request(`/v1/clients/${CLIENT_ID}/channels`, {}, TEST_ENV);
    expect(res.status).toBe(401);
  });
});

describe("GET /v1/clients/:clientId/channels/:channelId", () => {
  it(
    "returns a Slack channel with its webhook",
    skipIfNoDb(async () => {
      const res = await app.request(`/v1/clients/${CLIENT_ID}/channels/${SLACK_ID}`, authed(), TEST_ENV);
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.data).toMatchObject({
        id: SLACK_ID,
        type: "slack",
        name: "#leads",
        slack: { webhookUrl: "https://hooks.slack.com/services/SECRET" },
      });
    })
  );

  it(
    "returns an email channel with its addresses",
    skipIfNoDb(async () => {
      const res = await app.request(`/v1/clients/${CLIENT_ID}/channels/${EMAIL_ID}`, authed(), TEST_ENV);
      const body = (await res.json()) as any;
      expect(body.data.email).toEqual({ emailAddresses: ["a@acme.com", "b@acme.com"] });
      expect(body.data).not.toHaveProperty("slack");
    })
  );

  it(
    "returns 404 for another client's channel",
    skipIfNoDb(async () => {
      const res = await app.request(`/v1/clients/${CLIENT_ID}/channels/${OTHER_ID}`, authed(), TEST_ENV);
      expect(res.status).toBe(404);
    })
  );

  it("returns 404 for a non-UUID channel id", async () => {
    const res = await app.request(`/v1/clients/${CLIENT_ID}/channels/not-a-uuid`, authed(), TEST_ENV);
    expect(res.status).toBe(404);
  });
});
