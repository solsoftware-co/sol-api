import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { env } from "cloudflare:test";
import { neon } from "@neondatabase/serverless";
import app from "../../src/index.js";
import type { Env } from "../../src/types/index.js";
import {
  insertTestClient,
  insertTestIntegration,
  insertTestChannel,
  insertTestForm,
  deleteTestClientCascade,
} from "../helpers/db-fixtures.js";

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

const CLIENT_ID = `test-forms-client-${Date.now()}`;
let FORM_ID: string;
let MAILCHIMP_ID: string;
let GROUP_01_ID: string;
let GROUP_02_ID: string;
let SLACK_ID: string;

// The "Form 01" scenario from docs/design/data-model.md: one form, two
// integrations, three notifications reporting on different integrations.
beforeAll(async () => {
  if (!DB_URL) return;
  const sql = neon(DB_URL);
  await insertTestClient(sql, { id: CLIENT_ID });
  MAILCHIMP_ID = await insertTestIntegration(sql, {
    clientId: CLIENT_ID,
    type: "mailchimp",
    name: "Newsletter",
    mailchimp: { apiKey: "mc-secret-key" },
  });
  GROUP_01_ID = await insertTestChannel(sql, { clientId: CLIENT_ID, type: "email", name: "Email group 01" });
  GROUP_02_ID = await insertTestChannel(sql, { clientId: CLIENT_ID, type: "email", name: "Email group 02" });
  SLACK_ID = await insertTestChannel(sql, {
    clientId: CLIENT_ID,
    type: "slack",
    name: "#leads",
    webhookUrl: "https://hooks.slack.com/services/SECRET",
  });
  FORM_ID = await insertTestForm(sql, {
    clientId: CLIENT_ID,
    name: "Form 01",
    payloadSchema: { type: "object", required: ["email"] },
    allowedOrigins: ["https://acme.com"],
    integrations: [{ integrationId: MAILCHIMP_ID, fieldMapping: { email: "email" } }],
    channels: [
      { channelId: GROUP_01_ID, subject: "New Mailchimp subscriber", includeFields: ["email"], integrationIds: [MAILCHIMP_ID] },
      { channelId: GROUP_02_ID, subject: "Form 01 submission", integrationIds: [MAILCHIMP_ID] },
      { channelId: SLACK_ID, message: "form 01 just ran successfully!" },
    ],
  });
});

afterAll(async () => {
  if (!DB_URL) return;
  await deleteTestClientCascade(neon(DB_URL), CLIENT_ID);
});

describe("GET /v1/forms/:formId", () => {
  it(
    "returns the form with its integrations and notifications, camelCase",
    skipIfNoDb(async () => {
      const res = await app.request(`/v1/forms/${FORM_ID}`, authed(), TEST_ENV);
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.data).toMatchObject({
        id: FORM_ID,
        clientId: CLIENT_ID,
        name: "Form 01",
        payloadSchema: { type: "object", required: ["email"] },
        allowedOrigins: ["https://acme.com"],
        integrations: [
          { integrationId: MAILCHIMP_ID, type: "mailchimp", name: "Newsletter", status: "active", fieldMapping: { email: "email" } },
        ],
      });
      const byName = Object.fromEntries(body.data.channels.map((c: any) => [c.name, c]));
      expect(byName["Email group 01"]).toEqual({
        channelId: GROUP_01_ID,
        type: "email",
        name: "Email group 01",
        template: "form_submission",
        subject: "New Mailchimp subscriber",
        includeFields: ["email"],
        message: null,
        integrationIds: [MAILCHIMP_ID],
      });
      expect(byName["Email group 02"].integrationIds).toEqual([MAILCHIMP_ID]);
      // No form_channel_integrations rows → reports on NO integrations (opt-in).
      expect(byName["#leads"]).toMatchObject({
        type: "slack",
        subject: null,
        message: "form 01 just ran successfully!",
        integrationIds: [],
      });
    })
  );

  it(
    "never includes credentials (integration keys, Slack webhooks)",
    skipIfNoDb(async () => {
      const res = await app.request(`/v1/forms/${FORM_ID}`, authed(), TEST_ENV);
      const text = await res.text();
      expect(text).not.toContain("mc-secret-key");
      expect(text).not.toContain("SECRET");
    })
  );

  it(
    "returns 404 for an unknown form",
    skipIfNoDb(async () => {
      const res = await app.request("/v1/forms/00000000-0000-0000-0000-000000000000", authed(), TEST_ENV);
      expect(res.status).toBe(404);
    })
  );

  it("returns 404 for a non-UUID form id", async () => {
    const res = await app.request("/v1/forms/not-a-uuid", authed(), TEST_ENV);
    expect(res.status).toBe(404);
  });

  it("returns 401 without X-API-Key", async () => {
    const res = await app.request("/v1/forms/00000000-0000-0000-0000-000000000000", {}, TEST_ENV);
    expect(res.status).toBe(401);
  });
});
