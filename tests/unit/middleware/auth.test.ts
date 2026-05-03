import { describe, it, expect } from "vitest";
import app from "../../../src/index.js";

const TEST_ENV = {
  DATABASE_URL: "postgres://invalid",
  API_KEY: "test-api-key",
  ENVIRONMENT: "test",
};

describe("Auth middleware", () => {
  it("allows requests with valid X-API-Key", async () => {
    const res = await app.request(
      "/v1/clients",
      { headers: { "X-API-Key": "test-api-key" } },
      TEST_ENV
    );
    expect(res.status).not.toBe(401);
  });

  it("rejects requests with missing X-API-Key", async () => {
    const res = await app.request("/v1/clients", {}, TEST_ENV);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  it("rejects requests with wrong X-API-Key", async () => {
    const res = await app.request(
      "/v1/clients",
      { headers: { "X-API-Key": "wrong-key" } },
      TEST_ENV
    );
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  it("does not require auth on GET /health", async () => {
    const res = await app.request("/health", {}, TEST_ENV);
    expect(res.status).not.toBe(401);
  });
});
