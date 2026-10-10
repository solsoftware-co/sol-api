import { describe, it, expect } from "vitest";
import { createSiteSchema } from "../../../src/validators/site.js";
import { createAnalyticsReportSchema } from "../../../src/validators/analytics-report.js";

const ID = "11111111-1111-4111-8111-111111111111";

describe("createSiteSchema", () => {
  it("accepts a name alone, and a full site", () => {
    expect(createSiteSchema.safeParse({ name: "Acme" }).success).toBe(true);
    expect(
      createSiteSchema.safeParse({
        name: "Acme",
        domain: "acme.com",
        stagingDomain: "staging.acme.com",
        ga4PropertyId: "123456789",
        ga4ServiceAccountId: ID,
        sanityConfig: { projectId: "abc123", prodDataset: "production", stagingDataset: "staging" },
        githubRepo: { repoUrl: "https://github.com/acme/site", stagingBranch: "staging" },
      }).success
    ).toBe(true);
  });

  it("lowercases domains and rejects a scheme or path", () => {
    const result = createSiteSchema.safeParse({ name: "Acme", domain: "Acme.COM" });
    expect(result.success && result.data.domain).toBe("acme.com");
    for (const domain of ["https://acme.com", "acme.com/path", "acme", "-acme.com"]) {
      expect(createSiteSchema.safeParse({ name: "Acme", domain }).success).toBe(false);
    }
  });

  it("requires a numeric GA4 property id and a UUID service account", () => {
    expect(createSiteSchema.safeParse({ name: "Acme", ga4PropertyId: "G-ABC123" }).success).toBe(false);
    expect(createSiteSchema.safeParse({ name: "Acme", ga4ServiceAccountId: "nope" }).success).toBe(false);
  });

  it("requires every Sanity field together, and a GitHub URL", () => {
    expect(createSiteSchema.safeParse({ name: "Acme", sanityConfig: { projectId: "abc" } }).success).toBe(false);
    expect(
      createSiteSchema.safeParse({ name: "Acme", githubRepo: { repoUrl: "https://gitlab.com/acme/site" } }).success
    ).toBe(false);
  });

  it("rejects unknown fields", () => {
    expect(createSiteSchema.safeParse({ name: "Acme", clientId: "x" }).success).toBe(false);
  });
});

describe("createAnalyticsReportSchema", () => {
  const base = { siteId: ID, cron: "0 9 * * 2", lookback: "last_week" };

  it("accepts a report, defaulting enabled and channelIds", () => {
    const result = createAnalyticsReportSchema.safeParse(base);
    expect(result.success && result.data).toMatchObject({ enabled: true, channelIds: [] });
  });

  it("accepts common 5-field crons and rejects anything else", () => {
    for (const cron of ["0 9 * * 2", "*/15 * * * *", "0 8 1 * *", "30 6 * * 1-5", "0 9,17 * * *"]) {
      expect(createAnalyticsReportSchema.safeParse({ ...base, cron }).success).toBe(true);
    }
    for (const cron of ["0 9 * *", "0 9 * * 2 2026", "@weekly", "0 9 * * TUE", ""]) {
      expect(createAnalyticsReportSchema.safeParse({ ...base, cron }).success).toBe(false);
    }
  });

  it("only accepts the lookbacks the database allows", () => {
    for (const lookback of ["last_week", "last_month", "last_7_days", "last_28_days"]) {
      expect(createAnalyticsReportSchema.safeParse({ ...base, lookback }).success).toBe(true);
    }
    expect(createAnalyticsReportSchema.safeParse({ ...base, lookback: "last_year" }).success).toBe(false);
  });

  it("rejects a repeated channel and a non-UUID site", () => {
    expect(createAnalyticsReportSchema.safeParse({ ...base, channelIds: [ID, ID.toUpperCase()] }).success).toBe(false);
    expect(createAnalyticsReportSchema.safeParse({ ...base, siteId: "nope" }).success).toBe(false);
  });
});
