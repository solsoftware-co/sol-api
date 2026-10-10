import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { env } from "cloudflare:test";
import { neon } from "@neondatabase/serverless";
import app from "../../src/index.js";
import type { Env } from "../../src/types/index.js";
import { createDb } from "../../src/lib/db.js";
import { insertForm } from "../../src/repositories/forms.js";
import { InvalidReferencesError } from "../../src/repositories/references.js";
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
const OTHER_CLIENT_ID = `test-forms-other-${Date.now()}`;
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
  await insertTestClient(sql, { id: OTHER_CLIENT_ID });
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

// For the write routes: a second integration of the client's, and an
// integration and channel that belong to another client.
let SHEETS_ID: string;
let OTHER_INTEGRATION_ID: string;
let OTHER_CHANNEL_ID: string;
const UNKNOWN_ID = "00000000-0000-4000-8000-000000000000";

beforeAll(async () => {
  if (!DB_URL) return;
  const sql = neon(DB_URL);
  SHEETS_ID = await insertTestIntegration(sql, { clientId: CLIENT_ID, type: "mailchimp", name: "Second list" });
  OTHER_INTEGRATION_ID = await insertTestIntegration(sql, { clientId: OTHER_CLIENT_ID, type: "mailchimp" });
  OTHER_CHANNEL_ID = await insertTestChannel(sql, { clientId: OTHER_CLIENT_ID, type: "email", name: "Other group" });
});

afterAll(async () => {
  if (!DB_URL) return;
  await deleteTestClientCascade(neon(DB_URL), CLIENT_ID);
  await deleteTestClientCascade(neon(DB_URL), OTHER_CLIENT_ID);
});

describe("GET /v1/clients/:clientId/forms/:formId", () => {
  it(
    "returns the form with its integrations and notifications, camelCase",
    skipIfNoDb(async () => {
      const res = await app.request(`/v1/clients/${CLIENT_ID}/forms/${FORM_ID}`, authed(), TEST_ENV);
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
      const res = await app.request(`/v1/clients/${CLIENT_ID}/forms/${FORM_ID}`, authed(), TEST_ENV);
      const text = await res.text();
      expect(text).not.toContain("mc-secret-key");
      expect(text).not.toContain("SECRET");
    })
  );

  it(
    "returns 404 for a form under another client",
    skipIfNoDb(async () => {
      const res = await app.request(`/v1/clients/${OTHER_CLIENT_ID}/forms/${FORM_ID}`, authed(), TEST_ENV);
      expect(res.status).toBe(404);
    })
  );

  it(
    "returns 404 for an unknown form",
    skipIfNoDb(async () => {
      const res = await app.request(`/v1/clients/${CLIENT_ID}/forms/00000000-0000-0000-0000-000000000000`, authed(), TEST_ENV);
      expect(res.status).toBe(404);
    })
  );

  it("returns 404 for a non-UUID form id", async () => {
    const res = await app.request(`/v1/clients/${CLIENT_ID}/forms/not-a-uuid`, authed(), TEST_ENV);
    expect(res.status).toBe(404);
  });

  it("returns 401 without X-API-Key", async () => {
    const res = await app.request(`/v1/clients/${CLIENT_ID}/forms/00000000-0000-0000-0000-000000000000`, {}, TEST_ENV);
    expect(res.status).toBe(401);
  });
});

function send(method: string, path: string, body?: unknown, init: RequestInit = authed()) {
  return app.request(
    path,
    {
      ...init,
      method,
      headers: { ...(init.headers as Record<string, string>), "Content-Type": "application/json" },
      ...(body !== undefined && { body: JSON.stringify(body) }),
    },
    TEST_ENV
  );
}

async function dataOf(res: Response) {
  return ((await res.json()) as any).data;
}

async function getFormBody(formId: string) {
  return dataOf(await app.request(`/v1/clients/${CLIENT_ID}/forms/${formId}`, authed(), TEST_ENV));
}

describe("POST /v1/clients/:clientId/forms", () => {
  const path = `/v1/clients/${CLIENT_ID}/forms`;

  it(
    "creates a form with its integrations and channels, responding with what GET returns",
    skipIfNoDb(async () => {
      const res = await send("POST", path, {
        name: "Created form",
        description: "From the create route",
        payloadSchema: { type: "object", required: ["email"] },
        integrations: [
          { integrationId: MAILCHIMP_ID, fieldMapping: { email: "email" } },
          { integrationId: SHEETS_ID },
        ],
        channels: [
          { channelId: GROUP_01_ID, subject: "New subscriber", includeFields: ["email"], integrationIds: [MAILCHIMP_ID] },
          { channelId: SLACK_ID, message: "submitted!" },
        ],
      });
      expect(res.status).toBe(201);
      const created = await dataOf(res);
      expect(created).toMatchObject({
        clientId: CLIENT_ID,
        name: "Created form",
        description: "From the create route",
        payloadSchema: { type: "object", required: ["email"] },
        allowedOrigins: [],
      });
      expect(created.integrations.map((i: any) => [i.integrationId, i.fieldMapping])).toEqual([
        [MAILCHIMP_ID, { email: "email" }],
        [SHEETS_ID, {}],
      ]);
      const group = created.channels.find((ch: any) => ch.channelId === GROUP_01_ID);
      expect(group).toMatchObject({
        template: "form_submission",
        subject: "New subscriber",
        includeFields: ["email"],
        message: null,
        integrationIds: [MAILCHIMP_ID],
      });
      const slack = created.channels.find((ch: any) => ch.channelId === SLACK_ID);
      expect(slack).toMatchObject({ subject: null, includeFields: null, message: "submitted!", integrationIds: [] });

      expect(await getFormBody(created.id)).toEqual(created);
    })
  );

  it(
    "creates a form with no links",
    skipIfNoDb(async () => {
      const res = await send("POST", path, { name: "Bare form", payloadSchema: {} });
      expect(res.status).toBe(201);
      expect(await dataOf(res)).toMatchObject({ integrations: [], channels: [] });
    })
  );

  it(
    "returns one 422 naming every bad id, treating other-client and unknown ids the same, and writes nothing",
    skipIfNoDb(async () => {
      const res = await send("POST", path, {
        name: "Bad refs",
        payloadSchema: {},
        integrations: [{ integrationId: MAILCHIMP_ID }, { integrationId: OTHER_INTEGRATION_ID }, { integrationId: UNKNOWN_ID }],
        channels: [{ channelId: OTHER_CHANNEL_ID }, { channelId: GROUP_02_ID }],
      });
      expect(res.status).toBe(422);
      expect(((await res.json()) as any).error).toEqual({
        code: "VALIDATION_ERROR",
        message: "Referenced records not found for this client",
        details: { integrationIds: [OTHER_INTEGRATION_ID, UNKNOWN_ID], channelIds: [OTHER_CHANNEL_ID] },
      });

      const sql = neon(DB_URL!);
      expect(await sql`SELECT 1 FROM forms WHERE client_id = ${CLIENT_ID} AND name = 'Bad refs'`).toHaveLength(0);
    })
  );

  it(
    "maps a link FK failure that slips past the check to the same 422, leaving nothing behind",
    skipIfNoDb(async () => {
      // The repository directly, skipping the service's check, as a race would.
      const attempt = insertForm(createDb(DB_URL!), {
        client_id: CLIENT_ID,
        name: "Race form",
        description: null,
        payload_schema: {},
        integrations: [{ integration_id: OTHER_INTEGRATION_ID, field_mapping: {} }],
        channels: [],
      });
      await expect(attempt).rejects.toBeInstanceOf(InvalidReferencesError);
      await expect(attempt).rejects.toMatchObject({ details: { integrationIds: [OTHER_INTEGRATION_ID] } });

      const sql = neon(DB_URL!);
      expect(await sql`SELECT 1 FROM forms WHERE client_id = ${CLIENT_ID} AND name = 'Race form'`).toHaveLength(0);
    })
  );

  it(
    "returns 404 for an unknown client",
    skipIfNoDb(async () => {
      const res = await send("POST", `/v1/clients/test-forms-missing-${Date.now()}/forms`, { name: "x", payloadSchema: {} });
      expect(res.status).toBe(404);
    })
  );

  it("returns 422 for a notification reporting on an integration the form doesn't run", async () => {
    const res = await send("POST", path, {
      name: "x",
      payloadSchema: {},
      channels: [{ channelId: GROUP_01_ID, integrationIds: [UNKNOWN_ID] }],
    });
    expect(res.status).toBe(422);
  });

  it("returns 422 for allowedOrigins, which create no longer accepts (SOL-45)", async () => {
    const res = await send("POST", path, { name: "x", payloadSchema: {}, allowedOrigins: ["https://acme.com"] });
    expect(res.status).toBe(422);
  });

  it("returns 401 without X-API-Key", async () => {
    const res = await send("POST", path, { name: "x", payloadSchema: {} }, {});
    expect(res.status).toBe(401);
  });
});

describe("PATCH /v1/clients/:clientId/forms/:formId", () => {
  it(
    "updates only the given fields and bumps updatedAt",
    skipIfNoDb(async () => {
      const before = await dataOf(await send("POST", `/v1/clients/${CLIENT_ID}/forms`, {
        name: "Patch me",
        description: "keep",
        payloadSchema: { type: "object" },
      }));
      const res = await send("PATCH", `/v1/clients/${CLIENT_ID}/forms/${before.id}`, { name: "Patched" });
      expect(res.status).toBe(200);
      const after = await dataOf(res);
      expect(after).toMatchObject({ name: "Patched", description: "keep", payloadSchema: { type: "object" } });
      expect(Date.parse(after.updatedAt)).toBeGreaterThan(Date.parse(before.updatedAt));
    })
  );

  it(
    "returns 404 for another client's form",
    skipIfNoDb(async () => {
      const res = await send("PATCH", `/v1/clients/${OTHER_CLIENT_ID}/forms/${FORM_ID}`, { name: "Stolen" });
      expect(res.status).toBe(404);
      expect((await getFormBody(FORM_ID)).name).toBe("Form 01");
    })
  );

  it("returns 422 for an empty patch", async () => {
    const res = await send("PATCH", `/v1/clients/${CLIENT_ID}/forms/${UNKNOWN_ID}`, {});
    expect(res.status).toBe(422);
  });
});

describe("form link routes", () => {
  let formId: string;

  beforeAll(async () => {
    if (!DB_URL) return;
    formId = await insertTestForm(neon(DB_URL), {
      clientId: CLIENT_ID,
      name: "Links form",
      integrations: [{ integrationId: MAILCHIMP_ID }],
      channels: [{ channelId: GROUP_01_ID, subject: "Hello", integrationIds: [MAILCHIMP_ID] }],
    });
  });

  const linkPath = (kind: "integrations" | "channels", id: string, client = CLIENT_ID) =>
    `/v1/clients/${client}/forms/${formId}/${kind}/${id}`;

  it(
    "PUT integration links a new integration, then replaces its field mapping",
    skipIfNoDb(async () => {
      const linked = await dataOf(await send("PUT", linkPath("integrations", SHEETS_ID), { fieldMapping: { a: "b" } }));
      expect(linked.integrations.find((i: any) => i.integrationId === SHEETS_ID).fieldMapping).toEqual({ a: "b" });

      const replaced = await dataOf(await send("PUT", linkPath("integrations", SHEETS_ID.toUpperCase()), {}));
      expect(replaced.integrations.filter((i: any) => i.integrationId === SHEETS_ID)).toHaveLength(1);
      expect(replaced.integrations.find((i: any) => i.integrationId === SHEETS_ID).fieldMapping).toEqual({});
    })
  );

  it(
    "PUT integration returns the same 404 for another client's integration and an unknown one",
    skipIfNoDb(async () => {
      const other = await send("PUT", linkPath("integrations", OTHER_INTEGRATION_ID), {});
      const unknown = await send("PUT", linkPath("integrations", UNKNOWN_ID), {});
      expect(other.status).toBe(404);
      expect(unknown.status).toBe(404);
      expect(((await other.json()) as any).error.message).toBe(`Integration not found: ${OTHER_INTEGRATION_ID}`);
      expect(((await unknown.json()) as any).error.message).toBe(`Integration not found: ${UNKNOWN_ID}`);
    })
  );

  it(
    "PUT channel links a channel reporting on the form's integrations, then replaces its settings",
    skipIfNoDb(async () => {
      const linked = await dataOf(
        await send("PUT", linkPath("channels", SLACK_ID), { message: "hi", integrationIds: [MAILCHIMP_ID, SHEETS_ID] })
      );
      expect(linked.channels.find((c: any) => c.channelId === SLACK_ID)).toMatchObject({
        message: "hi",
        integrationIds: expect.arrayContaining([MAILCHIMP_ID, SHEETS_ID]),
      });

      // PUT replaces: omitted settings go back to their defaults.
      const replaced = await dataOf(await send("PUT", linkPath("channels", SLACK_ID), { integrationIds: [SHEETS_ID] }));
      expect(replaced.channels.find((c: any) => c.channelId === SLACK_ID)).toMatchObject({
        template: "form_submission",
        message: null,
        integrationIds: [SHEETS_ID],
      });
    })
  );

  it(
    "PUT channel returns 422 for an integration the form doesn't run, writing nothing",
    skipIfNoDb(async () => {
      const res = await send("PUT", linkPath("channels", GROUP_02_ID), { integrationIds: [OTHER_INTEGRATION_ID] });
      expect(res.status).toBe(422);
      expect(((await res.json()) as any).error.details).toEqual({ integrationIds: [OTHER_INTEGRATION_ID] });
      expect((await getFormBody(formId)).channels.some((c: any) => c.channelId === GROUP_02_ID)).toBe(false);
    })
  );

  it(
    "PUT channel returns 404 for another client's channel",
    skipIfNoDb(async () => {
      expect((await send("PUT", linkPath("channels", OTHER_CHANNEL_ID), {})).status).toBe(404);
    })
  );

  it(
    "DELETE integration unlinks it and removes it from every notification reporting on it",
    skipIfNoDb(async () => {
      const res = await send("DELETE", linkPath("integrations", MAILCHIMP_ID));
      expect(res.status).toBe(200);
      const form = await dataOf(res);
      expect(form.integrations.some((i: any) => i.integrationId === MAILCHIMP_ID)).toBe(false);
      for (const channel of form.channels) expect(channel.integrationIds).not.toContain(MAILCHIMP_ID);
      expect(form.channels.find((c: any) => c.channelId === GROUP_01_ID).integrationIds).toEqual([]);
    })
  );

  it(
    "DELETE channel unlinks it",
    skipIfNoDb(async () => {
      const res = await send("DELETE", linkPath("channels", SLACK_ID));
      expect(res.status).toBe(200);
      expect((await dataOf(res)).channels.some((c: any) => c.channelId === SLACK_ID)).toBe(false);
    })
  );

  it(
    "DELETE returns 404 for a link the form doesn't have",
    skipIfNoDb(async () => {
      expect((await send("DELETE", linkPath("integrations", MAILCHIMP_ID))).status).toBe(404);
      expect((await send("DELETE", linkPath("channels", GROUP_02_ID))).status).toBe(404);
    })
  );

  it(
    "returns 404 for every link route on another client's form",
    skipIfNoDb(async () => {
      expect((await send("PUT", linkPath("integrations", SHEETS_ID, OTHER_CLIENT_ID), {})).status).toBe(404);
      expect((await send("DELETE", linkPath("integrations", SHEETS_ID, OTHER_CLIENT_ID))).status).toBe(404);
      expect((await send("PUT", linkPath("channels", GROUP_01_ID, OTHER_CLIENT_ID), {})).status).toBe(404);
      expect((await send("DELETE", linkPath("channels", GROUP_01_ID, OTHER_CLIENT_ID))).status).toBe(404);
      expect((await getFormBody(formId)).integrations.some((i: any) => i.integrationId === SHEETS_ID)).toBe(true);
    })
  );

  it("returns 404 for a non-UUID path id", async () => {
    expect((await send("PUT", `/v1/clients/${CLIENT_ID}/forms/nope/integrations/${SHEETS_ID}`, {})).status).toBe(404);
    expect((await send("DELETE", `/v1/clients/${CLIENT_ID}/forms/${UNKNOWN_ID}/channels/nope`)).status).toBe(404);
  });
});

