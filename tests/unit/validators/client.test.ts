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
      sanity_project_id: "abc123",
      sanity_production_dataset: "production",
      sanity_staging_dataset: "staging",
      github_repo: "solsoftware-co/acme-corp",
      github_default_branch: "main",
      github_test_branch: "develop",
      default_email: "billing@acme.com",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.default_email).toBe("billing@acme.com");
      expect(result.data.github_test_branch).toBe("develop");
    }
  });

  it("defaults github_default_branch to 'main' when omitted", () => {
    const result = createClientSchema.safeParse(valid);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.github_default_branch).toBe("main");
    }
  });

  it("rejects a default_email without @", () => {
    const result = createClientSchema.safeParse({ ...valid, default_email: "notanemail" });
    expect(result.success).toBe(false);
  });

  it("rejects a google_service_account_email without @", () => {
    const result = createClientSchema.safeParse({
      ...valid,
      google_service_account_email: "notanemail",
    });
    expect(result.success).toBe(false);
  });

  it("accepts a null default_email", () => {
    const result = createClientSchema.safeParse({ ...valid, default_email: null });
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

  it("accepts a default_email update", () => {
    const result = updateClientSchema.safeParse({ default_email: "new-billing@acme.com" });
    expect(result.success).toBe(true);
  });

  it("rejects a default_email without @", () => {
    const result = updateClientSchema.safeParse({ default_email: "notanemail" });
    expect(result.success).toBe(false);
  });

  it("rejects a google_service_account_email without @", () => {
    const result = updateClientSchema.safeParse({ google_service_account_email: "notanemail" });
    expect(result.success).toBe(false);
  });

  it("accepts sanity and github field updates", () => {
    const result = updateClientSchema.safeParse({
      sanity_project_id: "abc123",
      github_repo: "solsoftware-co/acme-corp",
    });
    expect(result.success).toBe(true);
  });
});
