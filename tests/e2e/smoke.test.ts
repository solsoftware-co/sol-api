import { describe, it, expect } from "vitest";

const PREVIEW_URL = process.env.PREVIEW_URL;
const API_KEY = process.env.API_KEY_STAGING;

const skip = !PREVIEW_URL;

// These are deliberately shallow: auth + one representative request per
// resource, confirming the deployed worker is wired up correctly end to end
// (routing, auth middleware, DB connectivity). Not a re-test of business
// logic — that's what the integration suite is for. E2E has no DB
// connection of its own (only PREVIEW_URL), so it can't seed fixtures; ID
// routes are exercised via their well-defined not-found path instead of
// assuming specific data exists on whatever Neon branch this PR preview
// was cut from.
const FAKE_CLIENT_ID = "e2e-smoke-nonexistent-client";
const FAKE_UUID = "00000000-0000-0000-0000-000000000000";

describe.skipIf(skip)("E2E smoke tests", () => {
  it("GET /health returns 200 with status ok", async () => {
    const res = await fetch(`${PREVIEW_URL}/health`);
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body).toMatchObject({ success: true, data: { status: "ok" } });
  });

  describe("GET /v1/clients/:clientId", () => {
    it("returns 401 without an API key", async () => {
      const res = await fetch(`${PREVIEW_URL}/v1/clients/${FAKE_CLIENT_ID}`);
      expect(res.status).toBe(401);
    });

    it("returns a well-formed 404 for a non-existent client, with a valid API key", async () => {
      const res = await fetch(`${PREVIEW_URL}/v1/clients/${FAKE_CLIENT_ID}`, {
        headers: { "X-API-Key": API_KEY! },
      });
      expect(res.status).toBe(404);
      const body = await res.json() as any;
      expect(body.success).toBe(false);
      expect(body.error.code).toBe("NOT_FOUND");
    });
  });

  describe("GET /v1/clients/:clientId/slack-channels/:channelId", () => {
    it("returns 401 without an API key", async () => {
      const res = await fetch(`${PREVIEW_URL}/v1/clients/${FAKE_CLIENT_ID}/slack-channels/${FAKE_UUID}`);
      expect(res.status).toBe(401);
    });

    it("returns 404 for a non-existent channel, with a valid API key", async () => {
      const res = await fetch(`${PREVIEW_URL}/v1/clients/${FAKE_CLIENT_ID}/slack-channels/${FAKE_UUID}`, {
        headers: { "X-API-Key": API_KEY! },
      });
      expect(res.status).toBe(404);
    });
  });

  describe("GET /v1/clients/:clientId/integrations/:integrationId", () => {
    it("returns 401 without an API key", async () => {
      const res = await fetch(`${PREVIEW_URL}/v1/clients/${FAKE_CLIENT_ID}/integrations/${FAKE_UUID}`);
      expect(res.status).toBe(401);
    });

    it("returns 404 for a non-existent integration, with a valid API key", async () => {
      const res = await fetch(`${PREVIEW_URL}/v1/clients/${FAKE_CLIENT_ID}/integrations/${FAKE_UUID}`, {
        headers: { "X-API-Key": API_KEY! },
      });
      expect(res.status).toBe(404);
    });
  });

  describe("GET /v1/sites", () => {
    it("returns 401 without an API key", async () => {
      const res = await fetch(`${PREVIEW_URL}/v1/sites`);
      expect(res.status).toBe(401);
    });

    it("returns 200 with a credential-free array, with a valid API key", async () => {
      const res = await fetch(`${PREVIEW_URL}/v1/sites`, {
        headers: { "X-API-Key": API_KEY! },
      });
      expect(res.status).toBe(200);
      const body = await res.json() as any;
      expect(body.success).toBe(true);
      expect(Array.isArray(body.data)).toBe(true);
      for (const item of body.data) {
        for (const key of Object.keys(item)) {
          expect(key.toLowerCase()).not.toMatch(/key|secret|password|serviceaccount/);
        }
      }
    });
  });

  describe("GET /v1/clients/:clientId/sites/:siteId", () => {
    it("returns 401 without an API key", async () => {
      const res = await fetch(`${PREVIEW_URL}/v1/clients/${FAKE_CLIENT_ID}/sites/${FAKE_UUID}`);
      expect(res.status).toBe(401);
    });

    it("returns 404 for a non-existent site, with a valid API key", async () => {
      const res = await fetch(`${PREVIEW_URL}/v1/clients/${FAKE_CLIENT_ID}/sites/${FAKE_UUID}`, {
        headers: { "X-API-Key": API_KEY! },
      });
      expect(res.status).toBe(404);
    });
  });

  describe("GET /v1/notification-logs (unchanged snake_case contract)", () => {
    it("returns 401 without an API key", async () => {
      const res = await fetch(`${PREVIEW_URL}/v1/notification-logs`);
      expect(res.status).toBe(401);
    });

    it("returns 200 with a valid API key", async () => {
      const res = await fetch(`${PREVIEW_URL}/v1/notification-logs`, {
        headers: { "X-API-Key": API_KEY! },
      });
      expect(res.status).toBe(200);
      const body = await res.json() as any;
      expect(body.success).toBe(true);
    });
  });

  describe("GET /legacy/clients (list, replaces the old /v1/clients list)", () => {
    it("returns 401 without an API key", async () => {
      const res = await fetch(`${PREVIEW_URL}/legacy/clients`);
      expect(res.status).toBe(401);
    });

    it("returns 200 with a valid API key", async () => {
      const res = await fetch(`${PREVIEW_URL}/legacy/clients`, {
        headers: { "X-API-Key": API_KEY! },
      });
      expect(res.status).toBe(200);
      const body = await res.json() as any;
      expect(body.success).toBe(true);
    });
  });

  describe("POST /legacy/notification-logs", () => {
    it("returns 401 without an API key", async () => {
      const res = await fetch(`${PREVIEW_URL}/legacy/notification-logs`, { method: "POST" });
      expect(res.status).toBe(401);
    });

    it("returns 404 for a non-existent client_id, with a valid API key", async () => {
      const res = await fetch(`${PREVIEW_URL}/legacy/notification-logs`, {
        method: "POST",
        headers: { "X-API-Key": API_KEY!, "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: FAKE_CLIENT_ID,
          workflow: "e2e-smoke",
          event_name: "smoke.test",
          outcome: "sent",
        }),
      });
      expect(res.status).toBe(404);
    });
  });
});
