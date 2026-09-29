import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { env } from "cloudflare:test";
import { neon } from "@neondatabase/serverless";
import app from "../../src/index.js";
import type { Env } from "../../src/types/index.js";
import { generateApiKey, hashApiKey, type GeneratedApiKey } from "../../src/lib/api-keys.js";
import {
  insertTestClient,
  insertTestForm,
  insertTestFormApiKey,
  deleteTestClientCascade,
} from "../helpers/db-fixtures.js";

const DB_URL = (env as unknown as Env).DATABASE_URL;
const API_KEY = "test-api-key";
const TEST_ENV = { DATABASE_URL: DB_URL ?? "", API_KEY, ENVIRONMENT: "test" };

function authed(init: RequestInit = {}): RequestInit {
  return { ...init, headers: { ...(init.headers as Record<string, string>), "X-API-Key": API_KEY } };
}

function postJson(body: unknown): RequestInit {
  return authed({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
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

const CLIENT_ID = `test-form-keys-client-${Date.now()}`;
const OTHER_CLIENT_ID = `test-form-keys-other-${Date.now()}`;
const UNKNOWN_ID = "00000000-0000-0000-0000-000000000000";
let FORM_ID: string;
let OTHER_FORM_ID: string;

// Written directly to the table: a key in every state, for verify. The API
// can't create a revoked-at-birth or already-expired key.
let STATES_FORM_ID: string;
let ACTIVE: GeneratedApiKey;
let FUTURE_EXPIRY: GeneratedApiKey;
let REVOKED: GeneratedApiKey;
let EXPIRED: GeneratedApiKey;
let ACTIVE_KEY_ID: string;
let FUTURE_EXPIRY_KEY_ID: string;

beforeAll(async () => {
  if (!DB_URL) return;
  const sql = neon(DB_URL);
  await insertTestClient(sql, { id: CLIENT_ID });
  await insertTestClient(sql, { id: OTHER_CLIENT_ID });
  FORM_ID = await insertTestForm(sql, { clientId: CLIENT_ID, name: "Keys form" });
  OTHER_FORM_ID = await insertTestForm(sql, { clientId: OTHER_CLIENT_ID, name: "Other client's form" });
  STATES_FORM_ID = await insertTestForm(sql, { clientId: CLIENT_ID, name: "Key states form" });

  [ACTIVE, FUTURE_EXPIRY, REVOKED, EXPIRED] = await Promise.all(Array.from({ length: 4 }, () => generateApiKey()));
  const hour = 60 * 60 * 1000;
  const base = { clientId: CLIENT_ID, formId: STATES_FORM_ID };
  ACTIVE_KEY_ID = await insertTestFormApiKey(sql, { ...base, keyHash: ACTIVE.keyHash });
  FUTURE_EXPIRY_KEY_ID = await insertTestFormApiKey(sql, {
    ...base,
    keyHash: FUTURE_EXPIRY.keyHash,
    expiresAt: new Date(Date.now() + hour).toISOString(),
  });
  await insertTestFormApiKey(sql, { ...base, keyHash: REVOKED.keyHash, revokedAt: new Date(Date.now() - hour).toISOString() });
  await insertTestFormApiKey(sql, { ...base, keyHash: EXPIRED.keyHash, expiresAt: new Date(Date.now() - hour).toISOString() });
});

afterAll(async () => {
  if (!DB_URL) return;
  await deleteTestClientCascade(neon(DB_URL), CLIENT_ID);
  await deleteTestClientCascade(neon(DB_URL), OTHER_CLIENT_ID);
});

async function createKey(body: unknown = { name: "acme.com production" }) {
  const res = await app.request(`/v1/clients/${CLIENT_ID}/forms/${FORM_ID}/api-keys`, postJson(body), TEST_ENV);
  return { res, body: (await res.json()) as any };
}

describe("POST /v1/clients/:clientId/forms/:formId/api-keys", () => {
  it(
    "creates a key and returns the plaintext once",
    skipIfNoDb(async () => {
      const { res, body } = await createKey();
      expect(res.status).toBe(201);
      expect(Object.keys(body.data).sort()).toEqual(["createdAt", "expiresAt", "id", "key", "keyPrefix", "name"]);
      expect(body.data.name).toBe("acme.com production");
      expect(body.data.expiresAt).toBeNull();
      expect(body.data.key).toMatch(/^sgk_[A-Za-z0-9_-]{43}$/);
      expect(body.data.keyPrefix).toBe(body.data.key.slice(0, 12));
    })
  );

  it(
    "stores only the SHA-256 of the key, never the plaintext",
    skipIfNoDb(async () => {
      const { body } = await createKey();
      const rows = (await neon(DB_URL)`SELECT * FROM form_api_keys WHERE id = ${body.data.id}`) as any[];
      expect(rows[0].key_hash).toBe(await hashApiKey(body.data.key));
      expect(JSON.stringify(rows[0])).not.toContain(body.data.key);
    })
  );

  it(
    "accepts an optional future expiresAt",
    skipIfNoDb(async () => {
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      const { res, body } = await createKey({ name: "expiring", expiresAt });
      expect(res.status).toBe(201);
      expect(Date.parse(body.data.expiresAt)).toBe(Date.parse(expiresAt));
    })
  );

  it("returns 422 without a name", async () => {
    const res = await app.request(`/v1/clients/${CLIENT_ID}/forms/${UNKNOWN_ID}/api-keys`, postJson({}), TEST_ENV);
    expect(res.status).toBe(422);
  });

  it("returns 422 for an expiresAt in the past", async () => {
    const res = await app.request(
      `/v1/clients/${CLIENT_ID}/forms/${UNKNOWN_ID}/api-keys`,
      postJson({ name: "x", expiresAt: "2020-01-01T00:00:00Z" }),
      TEST_ENV
    );
    expect(res.status).toBe(422);
  });

  it(
    "returns 404 for another client's form",
    skipIfNoDb(async () => {
      const res = await app.request(
        `/v1/clients/${CLIENT_ID}/forms/${OTHER_FORM_ID}/api-keys`,
        postJson({ name: "sneaky" }),
        TEST_ENV
      );
      expect(res.status).toBe(404);
      const rows = await neon(DB_URL)`SELECT id FROM form_api_keys WHERE form_id = ${OTHER_FORM_ID}`;
      expect(rows).toHaveLength(0);
    })
  );

  it(
    "returns 404 for an unknown form",
    skipIfNoDb(async () => {
      const res = await app.request(`/v1/clients/${CLIENT_ID}/forms/${UNKNOWN_ID}/api-keys`, postJson({ name: "x" }), TEST_ENV);
      expect(res.status).toBe(404);
    })
  );

  it("returns 404 for a non-UUID form id", async () => {
    const res = await app.request(`/v1/clients/${CLIENT_ID}/forms/not-a-uuid/api-keys`, postJson({ name: "x" }), TEST_ENV);
    expect(res.status).toBe(404);
  });

  it("returns 401 without X-API-Key", async () => {
    const res = await app.request(`/v1/clients/${CLIENT_ID}/forms/${UNKNOWN_ID}/api-keys`, { method: "POST" }, TEST_ENV);
    expect(res.status).toBe(401);
  });
});

describe("GET /v1/clients/:clientId/forms/:formId/api-keys", () => {
  it(
    "lists the form's keys without the plaintext or the hash",
    skipIfNoDb(async () => {
      const { body: created } = await createKey({ name: "listed" });
      const res = await app.request(`/v1/clients/${CLIENT_ID}/forms/${FORM_ID}/api-keys`, authed(), TEST_ENV);
      expect(res.status).toBe(200);
      const text = await res.text();
      expect(text).not.toContain(created.data.key);
      expect(text).not.toContain(await hashApiKey(created.data.key));

      const listed = (JSON.parse(text) as any).data.find((k: any) => k.id === created.data.id);
      expect(listed).toEqual({
        id: created.data.id,
        name: "listed",
        keyPrefix: created.data.keyPrefix,
        createdAt: created.data.createdAt,
        revokedAt: null,
        expiresAt: null,
      });
    })
  );

  it(
    "includes revoked and expired keys (the full history)",
    skipIfNoDb(async () => {
      const res = await app.request(`/v1/clients/${CLIENT_ID}/forms/${STATES_FORM_ID}/api-keys`, authed(), TEST_ENV);
      const body = (await res.json()) as any;
      expect(body.data).toHaveLength(4);
      expect(JSON.stringify(body)).not.toContain(ACTIVE.keyHash);
    })
  );

  it(
    "returns 404 for another client's form",
    skipIfNoDb(async () => {
      const res = await app.request(`/v1/clients/${CLIENT_ID}/forms/${OTHER_FORM_ID}/api-keys`, authed(), TEST_ENV);
      expect(res.status).toBe(404);
    })
  );

  it(
    "returns 404 for an unknown form",
    skipIfNoDb(async () => {
      const res = await app.request(`/v1/clients/${CLIENT_ID}/forms/${UNKNOWN_ID}/api-keys`, authed(), TEST_ENV);
      expect(res.status).toBe(404);
    })
  );
});

describe("DELETE /v1/clients/:clientId/forms/:formId/api-keys/:keyId", () => {
  it(
    "revokes the key (204), keeping it in the list with revokedAt set",
    skipIfNoDb(async () => {
      const { body: created } = await createKey({ name: "to revoke" });
      const url = `/v1/clients/${CLIENT_ID}/forms/${FORM_ID}/api-keys/${created.data.id}`;

      const res = await app.request(url, authed({ method: "DELETE" }), TEST_ENV);
      expect(res.status).toBe(204);
      expect(await res.text()).toBe("");

      const list = (await (await app.request(`/v1/clients/${CLIENT_ID}/forms/${FORM_ID}/api-keys`, authed(), TEST_ENV)).json()) as any;
      const revoked = list.data.find((k: any) => k.id === created.data.id);
      expect(revoked.revokedAt).not.toBeNull();

      // Idempotent: revoking again is a 204 and keeps the original revokedAt.
      const again = await app.request(url, authed({ method: "DELETE" }), TEST_ENV);
      expect(again.status).toBe(204);
      const list2 = (await (await app.request(`/v1/clients/${CLIENT_ID}/forms/${FORM_ID}/api-keys`, authed(), TEST_ENV)).json()) as any;
      expect(list2.data.find((k: any) => k.id === created.data.id).revokedAt).toBe(revoked.revokedAt);
    })
  );

  it(
    "returns 404 for a key under another client, and leaves it active",
    skipIfNoDb(async () => {
      const { body: created } = await createKey({ name: "not yours" });
      const res = await app.request(
        `/v1/clients/${OTHER_CLIENT_ID}/forms/${FORM_ID}/api-keys/${created.data.id}`,
        authed({ method: "DELETE" }),
        TEST_ENV
      );
      expect(res.status).toBe(404);
      const rows = (await neon(DB_URL)`SELECT revoked_at FROM form_api_keys WHERE id = ${created.data.id}`) as any[];
      expect(rows[0].revoked_at).toBeNull();
    })
  );

  it(
    "returns 404 for a key under another form",
    skipIfNoDb(async () => {
      const res = await app.request(
        `/v1/clients/${CLIENT_ID}/forms/${FORM_ID}/api-keys/${ACTIVE_KEY_ID}`,
        authed({ method: "DELETE" }),
        TEST_ENV
      );
      expect(res.status).toBe(404);
    })
  );

  it(
    "returns 404 for an unknown key",
    skipIfNoDb(async () => {
      const res = await app.request(
        `/v1/clients/${CLIENT_ID}/forms/${FORM_ID}/api-keys/${UNKNOWN_ID}`,
        authed({ method: "DELETE" }),
        TEST_ENV
      );
      expect(res.status).toBe(404);
    })
  );

  it("returns 404 for a non-UUID key id", async () => {
    const res = await app.request(
      `/v1/clients/${CLIENT_ID}/forms/${UNKNOWN_ID}/api-keys/not-a-uuid`,
      authed({ method: "DELETE" }),
      TEST_ENV
    );
    expect(res.status).toBe(404);
  });
});

describe("POST /v1/clients/:clientId/forms/:formId/api-keys/verify", () => {
  async function verify(key: unknown, clientId = CLIENT_ID, formId = STATES_FORM_ID) {
    const res = await app.request(`/v1/clients/${clientId}/forms/${formId}/api-keys/verify`, postJson({ key }), TEST_ENV);
    return { res, body: (await res.json()) as any };
  }

  it(
    "authenticates an active key and returns only the matched key id",
    skipIfNoDb(async () => {
      const { res, body } = await verify(ACTIVE.key);
      expect(res.status).toBe(200);
      expect(body.data).toEqual({ authenticated: true, keyId: ACTIVE_KEY_ID });
    })
  );

  it(
    "authenticates a key whose expiry is in the future",
    skipIfNoDb(async () => {
      const { body } = await verify(FUTURE_EXPIRY.key);
      expect(body.data).toEqual({ authenticated: true, keyId: FUTURE_EXPIRY_KEY_ID });
    })
  );

  it(
    "rejects revoked and expired keys",
    skipIfNoDb(async () => {
      expect((await verify(REVOKED.key)).body.data).toEqual({ authenticated: false });
      expect((await verify(EXPIRED.key)).body.data).toEqual({ authenticated: false });
    })
  );

  it(
    "authenticates a key created through the API, and stops once it's revoked",
    skipIfNoDb(async () => {
      const { body: created } = await createKey({ name: "for verify" });
      expect((await verify(created.data.key, CLIENT_ID, FORM_ID)).body.data).toEqual({
        authenticated: true,
        keyId: created.data.id,
      });
      await app.request(
        `/v1/clients/${CLIENT_ID}/forms/${FORM_ID}/api-keys/${created.data.id}`,
        authed({ method: "DELETE" }),
        TEST_ENV
      );
      expect((await verify(created.data.key, CLIENT_ID, FORM_ID)).body.data).toEqual({ authenticated: false });
    })
  );

  it(
    "rejects a valid key presented for another form",
    skipIfNoDb(async () => {
      expect((await verify(ACTIVE.key, CLIENT_ID, FORM_ID)).body.data).toEqual({ authenticated: false });
    })
  );

  it(
    "rejects a valid key presented under another client (200, not a 404)",
    skipIfNoDb(async () => {
      const { res, body } = await verify(ACTIVE.key, OTHER_CLIENT_ID);
      expect(res.status).toBe(200);
      expect(body.data).toEqual({ authenticated: false });
    })
  );

  it(
    "rejects an unknown key and an unknown form",
    skipIfNoDb(async () => {
      expect((await verify((await generateApiKey()).key)).body.data).toEqual({ authenticated: false });
      expect((await verify(ACTIVE.key, CLIENT_ID, UNKNOWN_ID)).body.data).toEqual({ authenticated: false });
    })
  );

  it("rejects a key without the sgk_ prefix without a lookup", async () => {
    const { res, body } = await verify("not-a-form-key", CLIENT_ID, UNKNOWN_ID);
    expect(res.status).toBe(200);
    expect(body.data).toEqual({ authenticated: false });
  });

  it("rejects a non-UUID form id (200, not a 404)", async () => {
    const { res, body } = await verify("sgk_whatever", CLIENT_ID, "not-a-uuid");
    expect(res.status).toBe(200);
    expect(body.data).toEqual({ authenticated: false });
  });

  it("returns 422 without a key", async () => {
    const { res } = await verify(undefined, CLIENT_ID, UNKNOWN_ID);
    expect(res.status).toBe(422);
  });

  it("returns 401 without X-API-Key", async () => {
    const res = await app.request(
      `/v1/clients/${CLIENT_ID}/forms/${UNKNOWN_ID}/api-keys/verify`,
      { method: "POST", body: JSON.stringify({ key: "sgk_x" }) },
      TEST_ENV
    );
    expect(res.status).toBe(401);
  });
});

describe("GET /v1/clients/:clientId/forms/:formId", () => {
  it(
    "never includes API keys or their hashes, even with ?include=apiKeys",
    skipIfNoDb(async () => {
      const res = await app.request(`/v1/clients/${CLIENT_ID}/forms/${STATES_FORM_ID}?include=apiKeys`, authed(), TEST_ENV);
      expect(res.status).toBe(200);
      const text = await res.text();
      expect(JSON.parse(text).data).not.toHaveProperty("apiKeys");
      expect(text).not.toContain(ACTIVE.keyHash);
    })
  );
});
