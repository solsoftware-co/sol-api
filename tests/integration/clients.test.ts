import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { env } from "cloudflare:test";
import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import app from "../../src/index.js";
import type { Env } from "../../src/types/index.js";

const DB_URL = (env as unknown as Env).DATABASE_URL;
const API_KEY = "test-api-key";

const TEST_ENV = {
  DATABASE_URL: DB_URL ?? "",
  API_KEY,
  ENVIRONMENT: "test",
};

const TEST_CLIENT_ID = `test-client-${Date.now()}`;
const TEST_CLIENT_ID_2 = `test-client-2-${Date.now()}`;

function authed(init: RequestInit = {}): RequestInit {
  return {
    ...init,
    headers: { ...(init.headers as Record<string, string>), "X-API-Key": API_KEY },
  };
}

// google_service_accounts/slack_channels are the source of truth as of the
// read/write cutover (see docs/design/data-model.md) — clients.slack_webhook_url
// still physically exists (not yet dropped) but nothing reads it anymore, so
// seed data has to populate the new table directly for the app to see it.
// SOL-22: sites/sanity_configs/github_repos (proxied via the client's one
// site) are likewise now the source of truth for ga4_property_id/sanity_*/
// github_*.
async function deleteTestClient<ArrayMode extends boolean, FullResults extends boolean>(
  sql: NeonQueryFunction<ArrayMode, FullResults>,
  id: string
): Promise<void> {
  await sql`DELETE FROM sanity_configs WHERE site_id IN (SELECT id FROM sites WHERE client_id = ${id})`;
  await sql`DELETE FROM github_repos WHERE site_id IN (SELECT id FROM sites WHERE client_id = ${id})`;
  await sql`DELETE FROM sites WHERE client_id = ${id}`;
  await sql`DELETE FROM slack_channels WHERE client_id = ${id}`;
  await sql`DELETE FROM google_service_accounts WHERE client_id = ${id}`;
  await sql`DELETE FROM integrations WHERE client_id = ${id}`;
  await sql`DELETE FROM clients WHERE id = ${id}`;
}

beforeAll(async () => {
  if (!DB_URL) return;
  const sql = neon(DB_URL);
  await sql`
    INSERT INTO clients (id, name, email, active, settings, timezone)
    VALUES
      (${TEST_CLIENT_ID}, 'Test Client', 'test@example.com', TRUE, '{}', 'America/Chicago'),
      (${TEST_CLIENT_ID_2}, 'Inactive Client', 'inactive@example.com', FALSE, '{}', 'America/Chicago')
    ON CONFLICT (id) DO NOTHING
  `;
  await sql`
    INSERT INTO slack_channels (client_id, name, webhook_url)
    VALUES (${TEST_CLIENT_ID}, 'Default', 'https://hooks.slack.com/services/T000/B000/XXXX')
  `;
  await sql`
    INSERT INTO sites (client_id, name, ga4_property_id)
    VALUES (${TEST_CLIENT_ID}, 'Test Client', '111222333')
  `;
});

afterAll(async () => {
  if (!DB_URL) return;
  const sql = neon(DB_URL);
  await deleteTestClient(sql, TEST_CLIENT_ID);
  await deleteTestClient(sql, TEST_CLIENT_ID_2);
});

function skipIfNoDb(testFn: () => Promise<void>): () => Promise<void> {
  return async () => {
    if (!DB_URL) {
      console.warn("Skipping DB test: DATABASE_URL not set");
      return;
    }
    await testFn();
  };
}

// ─── GET /v1/clients/:id (US1) ───────────────────────────────────────────────

describe("GET /v1/clients/:id", () => {
  it(
    "returns 200 with ClientSummary (no credential) by default",
    skipIfNoDb(async () => {
      const res = await app.request(
        `/v1/clients/${TEST_CLIENT_ID}`,
        authed(),
        TEST_ENV
      );
      expect(res.status).toBe(200);
      const body = await res.json() as any;
      expect(body.success).toBe(true);
      expect(body.data.id).toBe(TEST_CLIENT_ID);
      expect("google_service_account_key" in body.data).toBe(false);
      expect("slack_webhook_url" in body.data).toBe(false);
    })
  );

  it(
    "returns ga4_property_id sourced from the sites table, and github_default_branch falling back to 'main' with no github_repos row",
    skipIfNoDb(async () => {
      const res = await app.request(`/v1/clients/${TEST_CLIENT_ID}`, authed(), TEST_ENV);
      expect(res.status).toBe(200);
      const body = await res.json() as any;
      expect(body.data.ga4_property_id).toBe("111222333");
      expect(body.data.sanity_project_id).toBe(null);
      expect(body.data.github_repo).toBe(null);
      expect(body.data.github_default_branch).toBe("main");
      expect(body.data.github_test_branch).toBe(null);
    })
  );

  it(
    "returns 200 with the credential included when ?include=google_credentials",
    skipIfNoDb(async () => {
      const res = await app.request(
        `/v1/clients/${TEST_CLIENT_ID}?include=google_credentials`,
        authed(),
        TEST_ENV
      );
      expect(res.status).toBe(200);
      const body = await res.json() as any;
      expect(body.success).toBe(true);
      expect(body.data.id).toBe(TEST_CLIENT_ID);
      expect("google_service_account_key" in body.data).toBe(true);
      expect("slack_webhook_url" in body.data).toBe(false);
    })
  );

  it(
    "returns 200 with only the Slack credential when ?include=slack_credentials",
    skipIfNoDb(async () => {
      const res = await app.request(
        `/v1/clients/${TEST_CLIENT_ID}?include=slack_credentials`,
        authed(),
        TEST_ENV
      );
      expect(res.status).toBe(200);
      const body = await res.json() as any;
      expect(body.data.slack_webhook_url).toBe("https://hooks.slack.com/services/T000/B000/XXXX");
      expect("google_service_account_key" in body.data).toBe(false);
    })
  );

  it(
    "returns 200 with both credentials when ?include=google_credentials,slack_credentials",
    skipIfNoDb(async () => {
      const res = await app.request(
        `/v1/clients/${TEST_CLIENT_ID}?include=google_credentials,slack_credentials`,
        authed(),
        TEST_ENV
      );
      expect(res.status).toBe(200);
      const body = await res.json() as any;
      expect("google_service_account_key" in body.data).toBe(true);
      expect(body.data.slack_webhook_url).toBe("https://hooks.slack.com/services/T000/B000/XXXX");
    })
  );

  it(
    "returns 404 for non-existent client",
    skipIfNoDb(async () => {
      const res = await app.request(
        "/v1/clients/does-not-exist",
        authed(),
        TEST_ENV
      );
      expect(res.status).toBe(404);
      const body = await res.json() as any;
      expect(body.error.code).toBe("NOT_FOUND");
    })
  );

  it(
    "returns 404 for inactive client",
    skipIfNoDb(async () => {
      const res = await app.request(
        `/v1/clients/${TEST_CLIENT_ID_2}`,
        authed(),
        TEST_ENV
      );
      expect(res.status).toBe(404);
    })
  );

  it("returns 401 without X-API-Key", async () => {
    const res = await app.request(
      "/v1/clients/any-id",
      {},
      TEST_ENV
    );
    expect(res.status).toBe(401);
  });
});

// ─── GET /v1/clients (US2) ───────────────────────────────────────────────────

describe("GET /v1/clients", () => {
  it(
    "returns 200 with only active clients",
    skipIfNoDb(async () => {
      const res = await app.request("/v1/clients", authed(), TEST_ENV);
      expect(res.status).toBe(200);
      const body = await res.json() as any;
      expect(body.success).toBe(true);
      expect(Array.isArray(body.data)).toBe(true);
      for (const client of body.data) {
        expect(client.active).toBe(true);
        expect("google_service_account_key" in client).toBe(false);
      }
    })
  );

  it("returns 200 with empty array when no active clients match", async () => {
    const res = await app.request(
      "/v1/clients?limit=0",
      authed(),
      { ...TEST_ENV, DATABASE_URL: DB_URL ?? "postgres://invalid" }
    );
    // limit=0 is invalid — expect 422
    expect(res.status).toBe(422);
  });

  it(
    "respects limit param",
    skipIfNoDb(async () => {
      const res = await app.request("/v1/clients?limit=1", authed(), TEST_ENV);
      expect(res.status).toBe(200);
      const body = await res.json() as any;
      expect(body.data.length).toBeLessThanOrEqual(1);
    })
  );

  it("returns 401 without X-API-Key", async () => {
    const res = await app.request("/v1/clients", {}, TEST_ENV);
    expect(res.status).toBe(401);
  });

  it(
    "google_service_account_key and slack_webhook_url are absent from every list item",
    skipIfNoDb(async () => {
      const res = await app.request("/v1/clients", authed(), TEST_ENV);
      const body = await res.json() as any;
      for (const item of body.data) {
        expect(item).not.toHaveProperty("google_service_account_key");
        expect(item).not.toHaveProperty("slack_webhook_url");
      }
    })
  );
});

// ─── POST /v1/clients (US3) ──────────────────────────────────────────────────

const NEW_CLIENT_ID = `test-new-${Date.now()}`;

describe("POST /v1/clients", () => {
  afterAll(async () => {
    if (!DB_URL) return;
    const sql = neon(DB_URL);
    await deleteTestClient(sql, NEW_CLIENT_ID);
  });

  it(
    "creates client and returns 201 with new record",
    skipIfNoDb(async () => {
      const res = await app.request(
        "/v1/clients",
        authed({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: NEW_CLIENT_ID,
            name: "New Test Client",
            email: "new-test@example.com",
            timezone: "America/New_York",
          }),
        }),
        TEST_ENV
      );
      expect(res.status).toBe(201);
      const body = await res.json() as any;
      expect(body.success).toBe(true);
      expect(body.data.id).toBe(NEW_CLIENT_ID);
    })
  );

  it(
    "creates client with slack_webhook_url",
    skipIfNoDb(async () => {
      const id = `${NEW_CLIENT_ID}-slack`;
      const res = await app.request(
        "/v1/clients",
        authed({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id,
            name: "Slack Client",
            email: "contact@example.com",
            slack_webhook_url: "https://hooks.slack.com/services/T111/B111/YYYY",
          }),
        }),
        TEST_ENV
      );
      expect(res.status).toBe(201);
      const body = await res.json() as any;
      expect(body.data.slack_webhook_url).toBe("https://hooks.slack.com/services/T111/B111/YYYY");

      const sql = neon(DB_URL!);
      await deleteTestClient(sql, id);
    })
  );

  it("returns 422 when slack_webhook_url isn't a valid URL", async () => {
    const res = await app.request(
      "/v1/clients",
      authed({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: `${NEW_CLIENT_ID}-bad-slack`,
          name: "Bad Slack Client",
          email: "contact@example.com",
          slack_webhook_url: "not-a-url",
        }),
      }),
      TEST_ENV
    );
    expect(res.status).toBe(422);
  });

  it("returns 422 when google_service_account_email is set without a key", async () => {
    const res = await app.request(
      "/v1/clients",
      authed({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: `${NEW_CLIENT_ID}-google-email-only`,
          name: "Google Email Only",
          email: "contact@example.com",
          google_service_account_email: "sa@project.iam.gserviceaccount.com",
        }),
      }),
      TEST_ENV
    );
    expect(res.status).toBe(422);
  });

  it("returns 422 when google_service_account_key is set without an email", async () => {
    const res = await app.request(
      "/v1/clients",
      authed({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: `${NEW_CLIENT_ID}-google-key-only`,
          name: "Google Key Only",
          email: "contact@example.com",
          google_service_account_key: "-----BEGIN PRIVATE KEY-----\n...",
        }),
      }),
      TEST_ENV
    );
    expect(res.status).toBe(422);
  });

  it(
    "creates client with google_service_account_email and _key together",
    skipIfNoDb(async () => {
      const id = `${NEW_CLIENT_ID}-google`;
      const res = await app.request(
        "/v1/clients",
        authed({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id,
            name: "Google Client",
            email: "contact@example.com",
            google_service_account_email: "sa@project.iam.gserviceaccount.com",
            google_service_account_key: "-----BEGIN PRIVATE KEY-----\n...",
          }),
        }),
        TEST_ENV
      );
      expect(res.status).toBe(201);
      const body = await res.json() as any;
      expect(body.data.google_service_account_email).toBe("sa@project.iam.gserviceaccount.com");
      expect(body.data.google_service_account_key).toBe("-----BEGIN PRIVATE KEY-----\n...");

      const getRes = await app.request(
        `/v1/clients/${id}?include=google_credentials`,
        authed(),
        TEST_ENV
      );
      const getBody = await getRes.json() as any;
      expect(getBody.data.google_service_account_email).toBe("sa@project.iam.gserviceaccount.com");
      expect(getBody.data.google_service_account_key).toBe("-----BEGIN PRIVATE KEY-----\n...");

      const sql = neon(DB_URL!);
      await deleteTestClient(sql, id);
    })
  );

  it(
    "creates client with ga4_property_id, sourced from the sites table on read",
    skipIfNoDb(async () => {
      const id = `${NEW_CLIENT_ID}-ga4`;
      const res = await app.request(
        "/v1/clients",
        authed({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id,
            name: "GA4 Client",
            email: "contact@example.com",
            ga4_property_id: "999888777",
          }),
        }),
        TEST_ENV
      );
      expect(res.status).toBe(201);
      const body = await res.json() as any;
      expect(body.data.ga4_property_id).toBe("999888777");

      const sql = neon(DB_URL!);
      const [site] = await sql`SELECT ga4_property_id FROM sites WHERE client_id = ${id}`;
      expect(site.ga4_property_id).toBe("999888777");

      await deleteTestClient(sql, id);
    })
  );

  it("returns 422 when only 1-2 of the 3 sanity_* fields are provided", async () => {
    const res = await app.request(
      "/v1/clients",
      authed({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: `${NEW_CLIENT_ID}-sanity-partial`,
          name: "Sanity Partial",
          email: "contact@example.com",
          sanity_project_id: "abc123",
          sanity_production_dataset: "production",
        }),
      }),
      TEST_ENV
    );
    expect(res.status).toBe(422);
  });

  it(
    "creates client with all 3 sanity_* fields together, creating a sanity_configs row",
    skipIfNoDb(async () => {
      const id = `${NEW_CLIENT_ID}-sanity`;
      const res = await app.request(
        "/v1/clients",
        authed({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id,
            name: "Sanity Client",
            email: "contact@example.com",
            sanity_project_id: "abc123",
            sanity_production_dataset: "production",
            sanity_staging_dataset: "staging",
          }),
        }),
        TEST_ENV
      );
      expect(res.status).toBe(201);
      const body = await res.json() as any;
      expect(body.data.sanity_project_id).toBe("abc123");
      expect(body.data.sanity_production_dataset).toBe("production");
      expect(body.data.sanity_staging_dataset).toBe("staging");

      const sql = neon(DB_URL!);
      await deleteTestClient(sql, id);
    })
  );

  it(
    "creates client with github_repo alone, defaulting github_default_branch to 'main'",
    skipIfNoDb(async () => {
      const id = `${NEW_CLIENT_ID}-github`;
      const res = await app.request(
        "/v1/clients",
        authed({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id,
            name: "GitHub Client",
            email: "contact@example.com",
            github_repo: "solsoftware-co/example",
          }),
        }),
        TEST_ENV
      );
      expect(res.status).toBe(201);
      const body = await res.json() as any;
      expect(body.data.github_repo).toBe("solsoftware-co/example");
      expect(body.data.github_default_branch).toBe("main");
      expect(body.data.github_test_branch).toBe(null);

      const sql = neon(DB_URL!);
      await deleteTestClient(sql, id);
    })
  );

  it(
    "returns 409 on duplicate ID",
    skipIfNoDb(async () => {
      const payload = {
        id: TEST_CLIENT_ID,
        name: "Dupe",
        email: "dupe@example.com",
      };
      const res = await app.request(
        "/v1/clients",
        authed({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }),
        TEST_ENV
      );
      expect(res.status).toBe(409);
      const body = await res.json() as any;
      expect(body.error.code).toBe("CONFLICT");
    })
  );

  it("returns 422 on missing required fields", async () => {
    const res = await app.request(
      "/v1/clients",
      authed({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "No ID or Email" }),
      }),
      TEST_ENV
    );
    expect(res.status).toBe(422);
    const body = await res.json() as any;
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(Array.isArray(body.error.details)).toBe(true);
  });

  it("returns 422 on invalid timezone", async () => {
    const res = await app.request(
      "/v1/clients",
      authed({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: "tz-test",
          name: "TZ Test",
          email: "tz@test.com",
          timezone: "Europe/London",
        }),
      }),
      TEST_ENV
    );
    expect(res.status).toBe(422);
  });

  it("returns 401 without X-API-Key", async () => {
    const res = await app.request(
      "/v1/clients",
      { method: "POST", body: "{}" },
      TEST_ENV
    );
    expect(res.status).toBe(401);
  });
});

// ─── PATCH /v1/clients/:id (US4) ─────────────────────────────────────────────

describe("PATCH /v1/clients/:id", () => {
  it(
    "updates a single field and leaves others unchanged",
    skipIfNoDb(async () => {
      const newName = `Updated-${Date.now()}`;
      const patchRes = await app.request(
        `/v1/clients/${TEST_CLIENT_ID}`,
        authed({
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: newName }),
        }),
        TEST_ENV
      );
      expect(patchRes.status).toBe(200);
      const patchBody = await patchRes.json() as any;
      expect(patchBody.data.name).toBe(newName);
      expect(patchBody.data.email).toBe("test@example.com");
    })
  );

  it(
    "updates slack_webhook_url",
    skipIfNoDb(async () => {
      const res = await app.request(
        `/v1/clients/${TEST_CLIENT_ID}`,
        authed({
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slack_webhook_url: "https://hooks.slack.com/services/T222/B222/ZZZZ" }),
        }),
        TEST_ENV
      );
      expect(res.status).toBe(200);
      const body = await res.json() as any;
      expect(body.data.slack_webhook_url).toBe("https://hooks.slack.com/services/T222/B222/ZZZZ");
    })
  );

  it(
    "clears slack_webhook_url when patched to null",
    skipIfNoDb(async () => {
      const res = await app.request(
        `/v1/clients/${TEST_CLIENT_ID}`,
        authed({
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slack_webhook_url: null }),
        }),
        TEST_ENV
      );
      expect(res.status).toBe(200);
      const body = await res.json() as any;
      expect(body.data.slack_webhook_url).toBeNull();

      const getRes = await app.request(
        `/v1/clients/${TEST_CLIENT_ID}?include=slack_credentials`,
        authed(),
        TEST_ENV
      );
      const getBody = await getRes.json() as any;
      expect(getBody.data.slack_webhook_url).toBeNull();
    })
  );

  it(
    "returns 422 when patching google_service_account_key alone with no existing account on file",
    skipIfNoDb(async () => {
      const res = await app.request(
        `/v1/clients/${TEST_CLIENT_ID}`,
        authed({
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ google_service_account_key: "-----BEGIN PRIVATE KEY-----\n..." }),
        }),
        TEST_ENV
      );
      expect(res.status).toBe(422);
    })
  );

  it(
    "creates a google service account via PATCH when email and key are provided together",
    skipIfNoDb(async () => {
      const res = await app.request(
        `/v1/clients/${TEST_CLIENT_ID}`,
        authed({
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            google_service_account_email: "sa@project.iam.gserviceaccount.com",
            google_service_account_key: "-----BEGIN PRIVATE KEY-----\n...",
          }),
        }),
        TEST_ENV
      );
      expect(res.status).toBe(200);
      const body = await res.json() as any;
      expect(body.data.google_service_account_email).toBe("sa@project.iam.gserviceaccount.com");
      expect(body.data.google_service_account_key).toBe("-----BEGIN PRIVATE KEY-----\n...");

      // Now that a row exists, patching the key alone must succeed (merges
      // with the email already on file rather than requiring both again).
      const rotateRes = await app.request(
        `/v1/clients/${TEST_CLIENT_ID}`,
        authed({
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ google_service_account_key: "-----BEGIN PRIVATE KEY-----\nrotated" }),
        }),
        TEST_ENV
      );
      expect(rotateRes.status).toBe(200);
      const rotateBody = await rotateRes.json() as any;
      expect(rotateBody.data.google_service_account_email).toBe("sa@project.iam.gserviceaccount.com");
      expect(rotateBody.data.google_service_account_key).toBe("-----BEGIN PRIVATE KEY-----\nrotated");
    })
  );

  it(
    "updates ga4_property_id via the site row",
    skipIfNoDb(async () => {
      const res = await app.request(
        `/v1/clients/${TEST_CLIENT_ID}`,
        authed({
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ga4_property_id: "444555666" }),
        }),
        TEST_ENV
      );
      expect(res.status).toBe(200);
      const body = await res.json() as any;
      expect(body.data.ga4_property_id).toBe("444555666");

      const sql = neon(DB_URL!);
      const [site] = await sql`SELECT ga4_property_id FROM sites WHERE client_id = ${TEST_CLIENT_ID}`;
      expect(site.ga4_property_id).toBe("444555666");
    })
  );

  it(
    "returns 422 when patching a single sanity_* field with no existing sanity_configs row",
    skipIfNoDb(async () => {
      const res = await app.request(
        `/v1/clients/${TEST_CLIENT_ID}`,
        authed({
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sanity_staging_dataset: "staging" }),
        }),
        TEST_ENV
      );
      expect(res.status).toBe(422);
    })
  );

  it(
    "sets github_repo via PATCH, then clears it back to null falling back to github_default_branch 'main'",
    skipIfNoDb(async () => {
      const setRes = await app.request(
        `/v1/clients/${TEST_CLIENT_ID}`,
        authed({
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ github_repo: "solsoftware-co/example", github_test_branch: "staging" }),
        }),
        TEST_ENV
      );
      expect(setRes.status).toBe(200);
      const setBody = await setRes.json() as any;
      expect(setBody.data.github_repo).toBe("solsoftware-co/example");
      expect(setBody.data.github_default_branch).toBe("main");
      expect(setBody.data.github_test_branch).toBe("staging");

      const clearRes = await app.request(
        `/v1/clients/${TEST_CLIENT_ID}`,
        authed({
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ github_repo: null }),
        }),
        TEST_ENV
      );
      expect(clearRes.status).toBe(200);
      const clearBody = await clearRes.json() as any;
      expect(clearBody.data.github_repo).toBe(null);
      expect(clearBody.data.github_default_branch).toBe("main");
      expect(clearBody.data.github_test_branch).toBe(null);
    })
  );

  it(
    "accepts a valid timezone update",
    skipIfNoDb(async () => {
      const res = await app.request(
        `/v1/clients/${TEST_CLIENT_ID}`,
        authed({
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ timezone: "America/Los_Angeles" }),
        }),
        TEST_ENV
      );
      expect(res.status).toBe(200);
    })
  );

  it("returns 422 on invalid timezone", async () => {
    const res = await app.request(
      `/v1/clients/${TEST_CLIENT_ID}`,
      authed({
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ timezone: "Europe/Berlin" }),
      }),
      TEST_ENV
    );
    expect(res.status).toBe(422);
  });

  it(
    "returns 404 for non-existent client",
    skipIfNoDb(async () => {
      const res = await app.request(
        "/v1/clients/does-not-exist",
        authed({
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "Ghost" }),
        }),
        TEST_ENV
      );
      expect(res.status).toBe(404);
    })
  );

  it("returns 401 without X-API-Key", async () => {
    const res = await app.request(
      `/v1/clients/${TEST_CLIENT_ID}`,
      { method: "PATCH", body: "{}" },
      TEST_ENV
    );
    expect(res.status).toBe(401);
  });
});
