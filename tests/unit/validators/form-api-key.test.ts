import { describe, it, expect } from "vitest";
import { createFormApiKeySchema } from "../../../src/validators/form-api-key.js";

describe("createFormApiKeySchema", () => {
  it("accepts a name alone", () => {
    const result = createFormApiKeySchema.safeParse({ name: "acme.com production" });
    expect(result.success).toBe(true);
  });

  it("trims the name and rejects a blank one", () => {
    const trimmed = createFormApiKeySchema.safeParse({ name: "  acme.com  " });
    expect(trimmed.success && trimmed.data.name).toBe("acme.com");
    expect(createFormApiKeySchema.safeParse({ name: "   " }).success).toBe(false);
  });

  it("rejects a missing name", () => {
    expect(createFormApiKeySchema.safeParse({}).success).toBe(false);
  });

  it("accepts a future expiresAt with an offset, and null", () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    expect(createFormApiKeySchema.safeParse({ name: "x", expiresAt: future }).success).toBe(true);
    expect(createFormApiKeySchema.safeParse({ name: "x", expiresAt: "2999-01-01T00:00:00-05:00" }).success).toBe(true);
    expect(createFormApiKeySchema.safeParse({ name: "x", expiresAt: null }).success).toBe(true);
  });

  it("rejects an expiresAt in the past or not an ISO datetime", () => {
    expect(createFormApiKeySchema.safeParse({ name: "x", expiresAt: "2020-01-01T00:00:00Z" }).success).toBe(false);
    expect(createFormApiKeySchema.safeParse({ name: "x", expiresAt: "next tuesday" }).success).toBe(false);
  });
});
