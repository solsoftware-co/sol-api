import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { env } from "cloudflare:test";
import { neon } from "@neondatabase/serverless";
import app from "../../src/index.js";
import type { Env } from "../../src/types/index.js";
import {
  insertTestClient,
  insertTestSite,
  insertTestChannel,
  insertTestAnalyticsReport,
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

const ACTIVE_CLIENT_ID = `test-reports-active-${Date.now()}`;
const INACTIVE_CLIENT_ID = `test-reports-inactive-${Date.now()}`;
let ENABLED_REPORT_ID: string;
let DISABLED_REPORT_ID: string;
let INACTIVE_CLIENT_REPORT_ID: string;
let CHANNEL_ID: string;

beforeAll(async () => {
  if (!DB_URL) return;
  const sql = neon(DB_URL);
  await insertTestClient(sql, { id: ACTIVE_CLIENT_ID, timezone: "America/Denver" });
  await insertTestClient(sql, { id: INACTIVE_CLIENT_ID, active: false });
  const siteId = await insertTestSite(sql, { clientId: ACTIVE_CLIENT_ID, name: "Acme Site", ga4PropertyId: "111222333" });
  const inactiveSiteId = await insertTestSite(sql, { clientId: INACTIVE_CLIENT_ID, name: "Inactive Site" });
  CHANNEL_ID = await insertTestChannel(sql, { clientId: ACTIVE_CLIENT_ID, type: "email", name: "Reports" });
  ENABLED_REPORT_ID = await insertTestAnalyticsReport(sql, {
    clientId: ACTIVE_CLIENT_ID,
    siteId,
    cron: "0 9 * * 1",
    lookback: "last_month",
    channelIds: [CHANNEL_ID],
  });
  DISABLED_REPORT_ID = await insertTestAnalyticsReport(sql, { clientId: ACTIVE_CLIENT_ID, siteId, enabled: false });
  INACTIVE_CLIENT_REPORT_ID = await insertTestAnalyticsReport(sql, { clientId: INACTIVE_CLIENT_ID, siteId: inactiveSiteId });
});

afterAll(async () => {
  if (!DB_URL) return;
  const sql = neon(DB_URL);
  await deleteTestClientCascade(sql, ACTIVE_CLIENT_ID);
  await deleteTestClientCascade(sql, INACTIVE_CLIENT_ID);
});

describe("GET /v1/analytics-reports", () => {
  it(
    "returns reports with their schedule, site, client timezone and channels",
    skipIfNoDb(async () => {
      const res = await app.request("/v1/analytics-reports", authed(), TEST_ENV);
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.data.find((r: any) => r.id === ENABLED_REPORT_ID)).toEqual({
        id: ENABLED_REPORT_ID,
        clientId: ACTIVE_CLIENT_ID,
        siteId: expect.any(String),
        siteName: "Acme Site",
        ga4PropertyId: "111222333",
        clientTimezone: "America/Denver",
        enabled: true,
        cron: "0 9 * * 1",
        lookback: "last_month",
        lastRunAt: null,
        channelIds: [CHANNEL_ID],
      });
    })
  );

  it(
    "never includes any credential-shaped key",
    skipIfNoDb(async () => {
      const res = await app.request("/v1/analytics-reports", authed(), TEST_ENV);
      const body = (await res.json()) as any;
      for (const item of body.data) {
        for (const key of Object.keys(item)) {
          expect(key.toLowerCase()).not.toMatch(/key|secret|password|serviceaccount|webhook/);
        }
      }
    })
  );

  it(
    "enabled=true excludes disabled reports",
    skipIfNoDb(async () => {
      const res = await app.request("/v1/analytics-reports?enabled=true", authed(), TEST_ENV);
      const ids = ((await res.json()) as any).data.map((r: any) => r.id);
      expect(ids).toContain(ENABLED_REPORT_ID);
      expect(ids).not.toContain(DISABLED_REPORT_ID);
    })
  );

  it(
    "active=true excludes reports of inactive clients",
    skipIfNoDb(async () => {
      const res = await app.request("/v1/analytics-reports?active=true", authed(), TEST_ENV);
      const ids = ((await res.json()) as any).data.map((r: any) => r.id);
      expect(ids).toContain(ENABLED_REPORT_ID);
      expect(ids).not.toContain(INACTIVE_CLIENT_REPORT_ID);
    })
  );

  it("returns 422 for a non-boolean filter", async () => {
    const res = await app.request("/v1/analytics-reports?enabled=yes", authed(), TEST_ENV);
    expect(res.status).toBe(422);
  });

  it("returns 401 without X-API-Key", async () => {
    const res = await app.request("/v1/analytics-reports", {}, TEST_ENV);
    expect(res.status).toBe(401);
  });
});
