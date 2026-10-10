import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { env } from "cloudflare:test";
import { neon } from "@neondatabase/serverless";
import app from "../../src/index.js";
import type { Env } from "../../src/types/index.js";
import { createDb } from "../../src/lib/db.js";
import { insertSite } from "../../src/repositories/sites.js";
import { InvalidReferencesError } from "../../src/repositories/references.js";
import {
  insertTestClient,
  insertTestGoogleServiceAccount,
  insertTestSite,
  deleteTestClientCascade,
} from "../helpers/db-fixtures.js";

const DB_URL = (env as unknown as Env).DATABASE_URL;
const API_KEY = "test-api-key";
const TEST_ENV = { DATABASE_URL: DB_URL ?? "", API_KEY, ENVIRONMENT: "test" };

const CLIENT_ID = `test-clientsite-client-${Date.now()}`;
const OTHER_CLIENT_ID = `test-clientsite-other-${Date.now()}`;
let SITE_WITH_GSA_ID: string;
let SITE_WITHOUT_GSA_ID: string;

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

let GSA_ID: string;

beforeAll(async () => {
  if (!DB_URL) return;
  const sql = neon(DB_URL);
  await insertTestClient(sql, { id: CLIENT_ID });
  await insertTestClient(sql, { id: OTHER_CLIENT_ID });

  GSA_ID = await insertTestGoogleServiceAccount(sql, {
    clientId: CLIENT_ID,
    email: "sa@project.iam.gserviceaccount.com",
    key: "-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----",
  });

  SITE_WITH_GSA_ID = await insertTestSite(sql, {
    clientId: CLIENT_ID,
    name: "Acme Corp",
    domain: "acme.com",
    ga4PropertyId: "111222333",
    ga4ServiceAccountId: GSA_ID,
  });

  SITE_WITHOUT_GSA_ID = await insertTestSite(sql, {
    clientId: CLIENT_ID,
    name: "No GSA Site",
  });
});

afterAll(async () => {
  if (!DB_URL) return;
  const sql = neon(DB_URL);
  await deleteTestClientCascade(sql, CLIENT_ID);
  await deleteTestClientCascade(sql, OTHER_CLIENT_ID);
});

describe("GET /v1/clients/:clientId/sites/:siteId", () => {
  it(
    "returns the base camelCase shape without ?include=",
    skipIfNoDb(async () => {
      const res = await app.request(`/v1/clients/${CLIENT_ID}/sites/${SITE_WITH_GSA_ID}`, authed(), TEST_ENV);
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.data).toEqual({
        id: SITE_WITH_GSA_ID,
        clientId: CLIENT_ID,
        name: "Acme Corp",
        description: null,
        domain: "acme.com",
        stagingDomain: null,
        ga4PropertyId: "111222333",
        ga4ServiceAccountId: GSA_ID,
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
        sanityConfig: null,
        githubRepo: null,
      });
      expect(body.data.googleServiceAccount).toBeUndefined();
    })
  );

  it(
    "adds googleServiceAccount only with ?include=googleServiceAccount",
    skipIfNoDb(async () => {
      const res = await app.request(
        `/v1/clients/${CLIENT_ID}/sites/${SITE_WITH_GSA_ID}?include=googleServiceAccount`,
        authed(),
        TEST_ENV
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.data.googleServiceAccount).toEqual({
        email: "sa@project.iam.gserviceaccount.com",
        key: "-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----",
      });
    })
  );

  it(
    "?include=googleServiceAccount on a site with no linked service account returns 200 without the field",
    skipIfNoDb(async () => {
      const res = await app.request(
        `/v1/clients/${CLIENT_ID}/sites/${SITE_WITHOUT_GSA_ID}?include=googleServiceAccount`,
        authed(),
        TEST_ENV
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.data.googleServiceAccount).toBeUndefined();
    })
  );

  it(
    "returns 404 when the site belongs to a different client",
    skipIfNoDb(async () => {
      const res = await app.request(
        `/v1/clients/${OTHER_CLIENT_ID}/sites/${SITE_WITH_GSA_ID}`,
        authed(),
        TEST_ENV
      );
      expect(res.status).toBe(404);
    })
  );

  it(
    "returns 404 for a malformed (non-uuid) site id without a 500",
    skipIfNoDb(async () => {
      const res = await app.request(`/v1/clients/${CLIENT_ID}/sites/not-a-uuid`, authed(), TEST_ENV);
      expect(res.status).toBe(404);
    })
  );

  it("returns 401 without X-API-Key", async () => {
    const res = await app.request(`/v1/clients/${CLIENT_ID}/sites/${SITE_WITH_GSA_ID}`, {}, TEST_ENV);
    expect(res.status).toBe(401);
  });
});

describe("POST /v1/clients/:clientId/sites", () => {
  let OTHER_GSA_ID: string;
  const UNKNOWN_ID = "00000000-0000-4000-8000-000000000000";

  beforeAll(async () => {
    if (!DB_URL) return;
    OTHER_GSA_ID = await insertTestGoogleServiceAccount(neon(DB_URL), { clientId: OTHER_CLIENT_ID });
  });

  function post(clientId: string, body: unknown, init: RequestInit = authed()) {
    return app.request(
      `/v1/clients/${clientId}/sites`,
      {
        ...init,
        method: "POST",
        headers: { ...(init.headers as Record<string, string>), "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
      TEST_ENV
    );
  }

  it(
    "creates a site with its Sanity config and GitHub repo, responding with what GET returns",
    skipIfNoDb(async () => {
      const res = await post(CLIENT_ID, {
        name: "Created site",
        domain: "created.example.com",
        stagingDomain: "staging.created.example.com",
        ga4PropertyId: "987654321",
        ga4ServiceAccountId: GSA_ID,
        sanityConfig: { projectId: "proj1", prodDataset: "production", stagingDataset: "staging" },
        githubRepo: { repoUrl: "https://github.com/acme/created", stagingBranch: "staging" },
      });
      expect(res.status).toBe(201);
      const created = ((await res.json()) as any).data;
      expect(created).toMatchObject({
        clientId: CLIENT_ID,
        name: "Created site",
        domain: "created.example.com",
        ga4PropertyId: "987654321",
        ga4ServiceAccountId: GSA_ID,
        sanityConfig: { projectId: "proj1", prodDataset: "production", stagingDataset: "staging" },
        githubRepo: { repoUrl: "https://github.com/acme/created", defaultBranch: "main", stagingBranch: "staging" },
      });
      expect(created).not.toHaveProperty("googleServiceAccount");

      const got = await app.request(`/v1/clients/${CLIENT_ID}/sites/${created.id}`, authed(), TEST_ENV);
      expect(((await got.json()) as any).data).toEqual(created);
    })
  );

  it(
    "creates a bare site with no Sanity, GitHub, or service account",
    skipIfNoDb(async () => {
      const res = await post(CLIENT_ID, { name: "Bare site" });
      expect(res.status).toBe(201);
      expect(((await res.json()) as any).data).toMatchObject({
        ga4ServiceAccountId: null,
        sanityConfig: null,
        githubRepo: null,
      });
    })
  );

  it(
    "returns the identical 422 for another client's service account and an unknown one, writing nothing",
    skipIfNoDb(async () => {
      const other = await post(CLIENT_ID, { name: "Bad GSA", ga4ServiceAccountId: OTHER_GSA_ID });
      const unknown = await post(CLIENT_ID, { name: "Bad GSA", ga4ServiceAccountId: UNKNOWN_ID });
      expect(other.status).toBe(422);
      expect(unknown.status).toBe(422);
      const otherError = ((await other.json()) as any).error;
      const unknownError = ((await unknown.json()) as any).error;
      expect(otherError.details).toEqual({ ga4ServiceAccountId: [OTHER_GSA_ID] });
      expect(unknownError.details).toEqual({ ga4ServiceAccountId: [UNKNOWN_ID] });
      expect({ ...otherError, details: null }).toEqual({ ...unknownError, details: null });

      const sql = neon(DB_URL!);
      expect(await sql`SELECT 1 FROM sites WHERE client_id = ${CLIENT_ID} AND name = 'Bad GSA'`).toHaveLength(0);
    })
  );

  it(
    "maps the same-client FK failing past the check to the same 422, leaving nothing behind",
    skipIfNoDb(async () => {
      const attempt = insertSite(createDb(DB_URL!), {
        client_id: CLIENT_ID,
        name: "Race site",
        description: null,
        domain: null,
        staging_domain: null,
        ga4_property_id: null,
        ga4_service_account_id: OTHER_GSA_ID,
        sanity_config: { project_id: "p", prod_dataset: "production", staging_dataset: "staging" },
        github_repo: null,
      });
      await expect(attempt).rejects.toBeInstanceOf(InvalidReferencesError);
      await expect(attempt).rejects.toMatchObject({ details: { ga4ServiceAccountId: [OTHER_GSA_ID] } });

      const sql = neon(DB_URL!);
      expect(await sql`SELECT 1 FROM sites WHERE client_id = ${CLIENT_ID} AND name = 'Race site'`).toHaveLength(0);
    })
  );

  it(
    "the database itself rejects a site using another client's service account",
    skipIfNoDb(async () => {
      const sql = neon(DB_URL!);
      await expect(sql`
        INSERT INTO sites (client_id, name, ga4_service_account_id) VALUES (${CLIENT_ID}, 'DB guard', ${OTHER_GSA_ID})
      `).rejects.toMatchObject({ code: "23503", constraint: "sites_client_id_ga4_service_account_id_fkey" });
    })
  );

  it(
    "returns 404 for an unknown client",
    skipIfNoDb(async () => {
      expect((await post(`test-clientsite-missing-${Date.now()}`, { name: "Orphan" })).status).toBe(404);
    })
  );

  it("returns 422 for an invalid body", async () => {
    expect((await post(CLIENT_ID, { name: "x", domain: "https://acme.com" })).status).toBe(422);
  });

  it("returns 401 without X-API-Key", async () => {
    expect((await post(CLIENT_ID, { name: "x" }, {})).status).toBe(401);
  });
});

