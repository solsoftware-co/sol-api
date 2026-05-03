import { describe, it, expect } from "vitest";
import { createClientSchema, updateClientSchema } from "../../../src/validators/client.js";

describe("createClientSchema", () => {
  const valid = {
    id: "acme-corp",
    name: "Acme Corp",
    email: "hello@acme.com",
  };

  it("accepts a minimal valid payload", () => {
    const result = createClientSchema.safeParse(valid);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.settings).toEqual({});
    }
  });

  it("accepts a full valid payload", () => {
    const result = createClientSchema.safeParse({
      ...valid,
      ga4_property_id: "properties/123",
      timezone: "America/New_York",
      settings: { banner: { imageUrl: "https://example.com/img.png" } },
      google_service_account_email: "sa@project.iam.gserviceaccount.com",
      google_service_account_key: "-----BEGIN PRIVATE KEY-----\n...",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a missing id", () => {
    const result = createClientSchema.safeParse({ name: "Acme", email: "a@b.com" });
    expect(result.success).toBe(false);
  });

  it("rejects a missing email", () => {
    const result = createClientSchema.safeParse({ id: "acme", name: "Acme" });
    expect(result.success).toBe(false);
  });

  it("rejects a missing name", () => {
    const result = createClientSchema.safeParse({ id: "acme", email: "a@b.com" });
    expect(result.success).toBe(false);
  });

  it("rejects an email without @", () => {
    const result = createClientSchema.safeParse({ ...valid, email: "notanemail" });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid timezone", () => {
    const result = createClientSchema.safeParse({ ...valid, timezone: "Europe/London" });
    expect(result.success).toBe(false);
  });

  it("rejects an id with spaces", () => {
    const result = createClientSchema.safeParse({ ...valid, id: "acme corp" });
    expect(result.success).toBe(false);
  });

  it("rejects an id exceeding 100 chars", () => {
    const result = createClientSchema.safeParse({ ...valid, id: "a".repeat(101) });
    expect(result.success).toBe(false);
  });
});

describe("updateClientSchema", () => {
  it("accepts a single-field update", () => {
    const result = updateClientSchema.safeParse({ email: "new@acme.com" });
    expect(result.success).toBe(true);
  });

  it("accepts a full partial update", () => {
    const result = updateClientSchema.safeParse({
      name: "New Name",
      email: "new@acme.com",
      active: false,
      timezone: "America/Los_Angeles",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an empty object", () => {
    const result = updateClientSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects an invalid timezone", () => {
    const result = updateClientSchema.safeParse({ timezone: "Europe/Paris" });
    expect(result.success).toBe(false);
  });

  it("rejects an email without @", () => {
    const result = updateClientSchema.safeParse({ email: "notvalid" });
    expect(result.success).toBe(false);
  });
});
