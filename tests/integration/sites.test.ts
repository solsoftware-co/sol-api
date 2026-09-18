import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { env } from "cloudflare:test";
import { neon } from "@neondatabase/serverless";
import app from "../../src/index.js";
import type { Env } from "../../src/types/index.js";
import {
  insertTestClient,
  insertTestGoogleServiceAccount,
  insertTestSite,
  deleteTestClientCascade,
} from "../helpers/db-fixtures.js";

const DB_URL = (env as unknown as Env).DATABASE_URL;
const API_KEY = "test-api-key";
const TEST_ENV = { DATABASE_URL: DB_URL ?? "", API_KEY, ENVIRONMENT: "test" };

const ACTIVE_CLIENT_ID = `test-sites-active-${Date.now()}`;
const INACTIVE_CLIENT_ID = `test-sites-inactive-${Date.now()}`;
let ACTIVE_SITE_ID: string;
let INACTIVE_CLIENT_SITE_ID: string;
let DISABLED_REPORTS_SITE_ID: string;

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
  await insertTestClient(sql, { id: ACTIVE_CLIENT_ID, timezone: "America/Denver" });
  await insertTestClient(sql, { id: INACTIVE_CLIENT_ID, active: false });

  const gsaId = await insertTestGoogleServiceAccount(sql, { clientId: ACTIVE_CLIENT_ID });

  ACTIVE_SITE_ID = await insertTestSite(sql, {
    clientId: ACTIVE_CLIENT_ID,
    name: "Acme Site",
    ga4PropertyId: "111222333",
    ga4ServiceAccountId: gsaId,
    analyticsRecipients: ["reports@acme.com"],
    analyticsReportsEnabled: true,
  });

  DISABLED_REPORTS_SITE_ID = await insertTestSite(sql, {
    clientId: ACTIVE_CLIENT_ID,
    name: "Acme Staging Site",
    analyticsReportsEnabled: false,
  });

  INACTIVE_CLIENT_SITE_ID = await insertTestSite(sql, {
    clientId: INACTIVE_CLIENT_ID,
    name: "Inactive Client Site",
  });
});

afterAll(async () => {
  if (!DB_URL) return;
  const sql = neon(DB_URL);
  await deleteTestClientCascade(sql, ACTIVE_CLIENT_ID);
  await deleteTestClientCascade(sql, INACTIVE_CLIENT_ID);
});

describe("GET /v1/sites", () => {
  it(
    "returns the camelCase flat shape, enriched with clientTimezone",
    skipIfNoDb(async () => {
      const res = await app.request("/v1/sites", authed(), TEST_ENV);
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      const site = body.data.find((s: any) => s.id === ACTIVE_SITE_ID);
      expect(site).toEqual({
        id: ACTIVE_SITE_ID,
        clientId: ACTIVE_CLIENT_ID,
        name: "Acme Site",
        ga4PropertyId: "111222333",
        analyticsRecipients: ["reports@acme.com"],
        analyticsReportsEnabled: true,
        clientTimezone: "America/Denver",
      });
    })
  );

  it(
    "never includes any credential-shaped key, regardless of query params",
    skipIfNoDb(async () => {
      for (const qs of ["", "?active=true", "?analyticsReportEnabled=true", "?active=false"]) {
        const res = await app.request(`/v1/sites${qs}`, authed(), TEST_ENV);
        const body = (await res.json()) as any;
        for (const item of body.data) {
          for (const key of Object.keys(item)) {
            expect(key.toLowerCase()).not.toMatch(/key|secret|password|serviceaccount/);
          }
        }
      }
    })
  );

  it(
    "active=true excludes sites belonging to inactive clients",
    skipIfNoDb(async () => {
      const res = await app.request("/v1/sites?active=true", authed(), TEST_ENV);
      const body = (await res.json()) as any;
      expect(body.data.some((s: any) => s.id === INACTIVE_CLIENT_SITE_ID)).toBe(false);
      expect(body.data.some((s: any) => s.id === ACTIVE_SITE_ID)).toBe(true);
    })
  );

  it(
    "active=false includes only sites belonging to inactive clients",
    skipIfNoDb(async () => {
      const res = await app.request("/v1/sites?active=false", authed(), TEST_ENV);
      const body = (await res.json()) as any;
      expect(body.data.some((s: any) => s.id === INACTIVE_CLIENT_SITE_ID)).toBe(true);
      expect(body.data.some((s: any) => s.id === ACTIVE_SITE_ID)).toBe(false);
    })
  );

  it(
    "analyticsReportEnabled=false filters to only disabled sites",
    skipIfNoDb(async () => {
      const res = await app.request("/v1/sites?analyticsReportEnabled=false", authed(), TEST_ENV);
      const body = (await res.json()) as any;
      expect(body.data.some((s: any) => s.id === DISABLED_REPORTS_SITE_ID)).toBe(true);
      expect(body.data.some((s: any) => s.id === ACTIVE_SITE_ID)).toBe(false);
    })
  );

  it("returns 422 for a non-boolean active value", async () => {
    const res = await app.request("/v1/sites?active=yes", authed(), TEST_ENV);
    expect(res.status).toBe(422);
  });

  it("returns 422 for a non-boolean analyticsReportEnabled value", async () => {
    const res = await app.request("/v1/sites?analyticsReportEnabled=nope", authed(), TEST_ENV);
    expect(res.status).toBe(422);
  });

  it("returns 401 without X-API-Key", async () => {
    const res = await app.request("/v1/sites", {}, TEST_ENV);
    expect(res.status).toBe(401);
  });
});
