import { describe, it, expect } from "vitest";

const PREVIEW_URL = process.env.PREVIEW_URL;
const API_KEY = process.env.API_KEY_STAGING;

const skip = !PREVIEW_URL;

describe.skipIf(skip)("E2E smoke tests", () => {
  it("GET /health returns 200 with status ok", async () => {
    const res = await fetch(`${PREVIEW_URL}/health`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ success: true, data: { status: "ok" } });
  });

  it("GET /v1/clients without API key returns 401", async () => {
    const res = await fetch(`${PREVIEW_URL}/v1/clients`);
    expect(res.status).toBe(401);
  });

  it("GET /v1/clients with valid API key returns 200", async () => {
    const res = await fetch(`${PREVIEW_URL}/v1/clients`, {
      headers: { "X-API-Key": API_KEY! },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });
});
