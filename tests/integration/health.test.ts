import { describe, it, expect } from "vitest";
import { env } from "cloudflare:test";
import app from "../../src/index.js";
import type { Env } from "../../src/types/index.js";

const BASE_ENV = {
  API_KEY: "test-api-key",
  ENVIRONMENT: "test",
};

describe("GET /health", () => {
  it("returns 503 when DATABASE_URL is invalid", async () => {
    const res = await app.request(
      "/health",
      {},
      { ...BASE_ENV, DATABASE_URL: "postgres://invalid-host-that-does-not-exist/db" }
    );
    expect(res.status).toBe(503);
    const body = await res.json() as any;
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("SERVICE_UNAVAILABLE");
  });

  it("does not require X-API-Key", async () => {
    const res = await app.request(
      "/health",
      {},
      { ...BASE_ENV, DATABASE_URL: "postgres://invalid-host/db" }
    );
    expect(res.status).not.toBe(401);
  });

  it("includes environment in response shape on success", async () => {
    const dbUrl = (env as unknown as Env).DATABASE_URL;
    if (!dbUrl) {
      console.warn("Skipping DB-connected health test: DATABASE_URL not set");
      return;
    }
    const res = await app.request(
      "/health",
      {},
      { ...BASE_ENV, DATABASE_URL: dbUrl, ENVIRONMENT: "test" }
    );
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.success).toBe(true);
    expect(body.data.status).toBe("ok");
    expect(body.data.database).toBe("connected");
    expect(body.data.environment).toBe("test");
  });
});
