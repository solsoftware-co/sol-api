import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { env } from "cloudflare:test";
import { neon } from "@neondatabase/serverless";
import app from "../../src/index.js";
import type { Env } from "../../src/types/index.js";
import { createDb } from "../../src/lib/db.js";
import { insertAnalyticsReport } from "../../src/repositories/analytics-reports.js";
import { InvalidReferencesError } from "../../src/repositories/references.js";
import { insertTestClient, insertTestSite, insertTestChannel, deleteTestClientCascade } from "../helpers/db-fixtures.js";

const DB_URL = (env as unknown as Env).DATABASE_URL;
const API_KEY = "test-api-key";
const TEST_ENV = { DATABASE_URL: DB_URL ?? "", API_KEY, ENVIRONMENT: "test" };

const CLIENT_ID = `test-reports-client-${Date.now()}`;
const OTHER_CLIENT_ID = `test-reports-other-${Date.now()}`;
const UNKNOWN_ID = "00000000-0000-4000-8000-000000000000";
let SITE_ID: string;
let EMAIL_ID: string;
let SLACK_ID: string;
let OTHER_SITE_ID: string;
let OTHER_CHANNEL_ID: string;

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
    `/v1/clients/${clientId}/analytics-reports`,
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
  SITE_ID = await insertTestSite(sql, { clientId: CLIENT_ID, name: "Reports site", ga4PropertyId: "123" });
  EMAIL_ID = await insertTestChannel(sql, { clientId: CLIENT_ID, type: "email", name: "Reports email" });
  SLACK_ID = await insertTestChannel(sql, { clientId: CLIENT_ID, type: "slack", name: "#reports" });
  OTHER_SITE_ID = await insertTestSite(sql, { clientId: OTHER_CLIENT_ID, name: "Other site" });
  OTHER_CHANNEL_ID = await insertTestChannel(sql, { clientId: OTHER_CLIENT_ID, type: "email", name: "Other email" });
});

afterAll(async () => {
  if (!DB_URL) return;
  const sql = neon(DB_URL);
  await deleteTestClientCascade(sql, CLIENT_ID);
  await deleteTestClientCascade(sql, OTHER_CLIENT_ID);
});

describe("POST /v1/clients/:clientId/analytics-reports", () => {
  it(
    "creates a report sent to the given channels, responding with what GET returns",
    skipIfNoDb(async () => {
      const res = await post(CLIENT_ID, {
        siteId: SITE_ID,
        cron: "0 9 * * 2",
        lookback: "last_week",
        channelIds: [EMAIL_ID, SLACK_ID],
      });
      expect(res.status).toBe(201);
      const created = ((await res.json()) as any).data;
      expect(created).toMatchObject({
        clientId: CLIENT_ID,
        siteId: SITE_ID,
        siteName: "Reports site",
        ga4PropertyId: "123",
        enabled: true,
        cron: "0 9 * * 2",
        lookback: "last_week",
        lastRunAt: null,
      });
      expect([...created.channelIds].sort()).toEqual([EMAIL_ID, SLACK_ID].sort());

      const got = await app.request(`/v1/clients/${CLIENT_ID}/analytics-reports/${created.id}`, authed(), TEST_ENV);
      expect(((await got.json()) as any).data).toEqual(created);

      // The scheduler's fleet-wide list sees it too.
      const list = await app.request(`/v1/analytics-reports?enabled=true`, authed(), TEST_ENV);
      expect(((await list.json()) as any).data.some((r: any) => r.id === created.id)).toBe(true);
    })
  );

  it(
    "returns one 422 naming the bad site and channels, treating other-client and unknown ids the same",
    skipIfNoDb(async () => {
      const res = await post(CLIENT_ID, {
        siteId: OTHER_SITE_ID,
        cron: "0 9 * * 2",
        lookback: "last_week",
        channelIds: [EMAIL_ID, OTHER_CHANNEL_ID, UNKNOWN_ID],
      });
      expect(res.status).toBe(422);
      expect(((await res.json()) as any).error).toEqual({
        code: "VALIDATION_ERROR",
        message: "Referenced records not found for this client",
        details: { siteId: [OTHER_SITE_ID], channelIds: [OTHER_CHANNEL_ID, UNKNOWN_ID] },
      });

      const sql = neon(DB_URL!);
      expect(await sql`SELECT 1 FROM analytics_reports WHERE site_id = ${OTHER_SITE_ID}`).toHaveLength(0);
    })
  );

  it(
    "maps a same-client FK failure past the check to the same 422, leaving nothing behind",
    skipIfNoDb(async () => {
      const attempt = insertAnalyticsReport(createDb(DB_URL!), {
        client_id: CLIENT_ID,
        site_id: SITE_ID,
        enabled: true,
        cron: "0 7 * * 1",
        lookback: "last_month",
        channel_ids: [OTHER_CHANNEL_ID],
      });
      await expect(attempt).rejects.toBeInstanceOf(InvalidReferencesError);
      await expect(attempt).rejects.toMatchObject({ details: { channelIds: [OTHER_CHANNEL_ID] } });

      const sql = neon(DB_URL!);
      expect(
        await sql`SELECT 1 FROM analytics_reports WHERE client_id = ${CLIENT_ID} AND cron = '0 7 * * 1'`
      ).toHaveLength(0);
    })
  );

  it(
    "returns 422 for an unknown client's site rather than 404, since the site check runs first",
    skipIfNoDb(async () => {
      const res = await post(`test-reports-missing-${Date.now()}`, {
        siteId: SITE_ID,
        cron: "0 9 * * 2",
        lookback: "last_week",
      });
      expect(res.status).toBe(422);
    })
  );

  it("returns 422 for an invalid cron", async () => {
    expect((await post(CLIENT_ID, { siteId: UNKNOWN_ID, cron: "weekly", lookback: "last_week" })).status).toBe(422);
  });

  it("returns 401 without X-API-Key", async () => {
    expect((await post(CLIENT_ID, { siteId: UNKNOWN_ID, cron: "0 9 * * 2", lookback: "last_week" }, {})).status).toBe(
      401
    );
  });
});

describe("GET /v1/clients/:clientId/analytics-reports/:reportId", () => {
  it(
    "returns 404 for another client's report and a non-UUID id",
    skipIfNoDb(async () => {
      const created = ((await (
        await post(CLIENT_ID, { siteId: SITE_ID, cron: "0 9 1 * *", lookback: "last_month" })
      ).json()) as any).data;
      expect(
        (await app.request(`/v1/clients/${OTHER_CLIENT_ID}/analytics-reports/${created.id}`, authed(), TEST_ENV)).status
      ).toBe(404);
      expect((await app.request(`/v1/clients/${CLIENT_ID}/analytics-reports/nope`, authed(), TEST_ENV)).status).toBe(
        404
      );
    })
  );
});
