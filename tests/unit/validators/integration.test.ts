import { describe, it, expect } from "vitest";
import { createIntegrationSchema } from "../../../src/validators/integration.js";
import { createGoogleServiceAccountSchema } from "../../../src/validators/google-service-account.js";

const GSA_ID = "11111111-1111-4111-8111-111111111111";
const mailchimp = { type: "mailchimp", name: "List", apiKey: "k-us14", listId: "l", serverPrefix: "us14" };
const sheets = { type: "google_sheets", name: "Sheet", googleServiceAccountId: GSA_ID, spreadsheetId: "s", columnMapping: ["email"] };

describe("createIntegrationSchema", () => {
  it("accepts Mailchimp and Google Sheets bodies", () => {
    expect(createIntegrationSchema.safeParse(mailchimp).success).toBe(true);
    expect(createIntegrationSchema.safeParse(sheets).success).toBe(true);
    expect(
      createIntegrationSchema.safeParse({ ...sheets, sheetName: "Leads", tableAnchor: "B2", description: null }).success
    ).toBe(true);
  });

  it("rejects a serverPrefix that isn't a Mailchimp datacenter", () => {
    for (const serverPrefix of ["us-14", "-us14", "US14", "14"]) {
      expect(createIntegrationSchema.safeParse({ ...mailchimp, serverPrefix }).success).toBe(false);
    }
  });

  it("requires a UUID service account and a non-empty column mapping", () => {
    expect(createIntegrationSchema.safeParse({ ...sheets, googleServiceAccountId: "nope" }).success).toBe(false);
    expect(createIntegrationSchema.safeParse({ ...sheets, columnMapping: [] }).success).toBe(false);
    expect(createIntegrationSchema.safeParse({ ...sheets, columnMapping: [""] }).success).toBe(false);
  });

  it("rejects a tableAnchor that isn't a cell reference", () => {
    for (const tableAnchor of ["a1", "A0", "1A", "A1:B2"]) {
      expect(createIntegrationSchema.safeParse({ ...sheets, tableAnchor }).success).toBe(false);
    }
  });

  it("rejects an unknown type and the other type's fields", () => {
    expect(createIntegrationSchema.safeParse({ ...mailchimp, type: "google_drive" }).success).toBe(false);
    expect(createIntegrationSchema.safeParse({ ...mailchimp, spreadsheetId: "s" }).success).toBe(false);
    expect(createIntegrationSchema.safeParse({ ...sheets, apiKey: "k" }).success).toBe(false);
  });

  it("requires a name", () => {
    const { name: _, ...noName } = mailchimp;
    expect(createIntegrationSchema.safeParse(noName).success).toBe(false);
    expect(createIntegrationSchema.safeParse({ ...mailchimp, name: "  " }).success).toBe(false);
  });
});

describe("createGoogleServiceAccountSchema", () => {
  const body = { name: "Writer", email: "w@p.iam.gserviceaccount.com", key: "-----BEGIN PRIVATE KEY-----" };

  it("accepts a valid body", () => {
    expect(createGoogleServiceAccountSchema.safeParse(body).success).toBe(true);
  });

  it("rejects a missing key, an empty key, an invalid email, or an unknown field", () => {
    const { key: _, ...noKey } = body;
    expect(createGoogleServiceAccountSchema.safeParse(noKey).success).toBe(false);
    expect(createGoogleServiceAccountSchema.safeParse({ ...body, key: "" }).success).toBe(false);
    expect(createGoogleServiceAccountSchema.safeParse({ ...body, email: "nope" }).success).toBe(false);
    expect(createGoogleServiceAccountSchema.safeParse({ ...body, clientId: "x" }).success).toBe(false);
  });
});
