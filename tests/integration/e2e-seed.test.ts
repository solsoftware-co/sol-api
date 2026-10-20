import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { env } from "cloudflare:test";
import { neon } from "@neondatabase/serverless";
import app from "../../src/index.js";
import type { Env } from "../../src/types/index.js";
import {
  solIntegrateSeedQueries,
  solIntegrateSandboxFromEnv,
  SOL_INTEGRATE_E2E_IDS as IDS,
} from "../../db/seeds/e2e/sol-integrate.js";
import { insertTestClient, deleteTestClientCascade } from "../helpers/db-fixtures.js";

// Runs the e2e seed (scripts/seed-e2e.ts) against this run's database with
// made-up sandbox credentials, then reads the rows back through the same
// endpoint sol-integrate uses — so a seed that no longer matches the schema,
// or the response sol-integrate reads, fails here rather than after merging.

const DB_URL = (env as unknown as Env).DATABASE_URL;
const API_KEY = "test-api-key";
const TEST_ENV = { DATABASE_URL: DB_URL ?? "", API_KEY, ENVIRONMENT: "test" };
const CLIENT_ID = `test-e2e-seed-${Date.now()}`;

const KEY_FILE = JSON.stringify({
  type: "service_account",
  client_email: "e2e@sandbox.iam.gserviceaccount.com",
  private_key: "-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----\n",
});
const SANDBOX_ENV = {
  MAILCHIMP_SANDBOX_API_KEY: "abc123-us14",
  MAILCHIMP_SANDBOX_AUDIENCE_ID: "list42",
  GOOGLE_SHEETS_SANDBOX_SERVICE_ACCOUNT: KEY_FILE,
  GOOGLE_SHEETS_SANDBOX_SPREADSHEET_ID: "sandbox-sheet",
};

function skipIfNoDb(testFn: () => Promise<void>): () => Promise<void> {
  return async () => {
    if (!DB_URL) {
      console.warn("Skipping DB test: DATABASE_URL not set");
      return;
    }
    await testFn();
  };
}

async function getIntegration(id: string) {
  const res = await app.request(`/v1/clients/${CLIENT_ID}/integrations/${id}`, { headers: { "X-API-Key": API_KEY } }, TEST_ENV);
  expect(res.status).toBe(200);
  return ((await res.json()) as { data: any }).data;
}

async function seed() {
  const sql = neon(DB_URL);
  await sql.transaction(solIntegrateSeedQueries(sql, solIntegrateSandboxFromEnv(SANDBOX_ENV), CLIENT_ID));
}

// The fixture IDs are fixed, so seeding them under a throwaway client would
// take over — and afterAll would then delete — the real fixtures in a
// database that already has them (dev). PR branches and staging don't.
let realFixturesPresent = false;

beforeAll(async () => {
  if (!DB_URL) return;
  const sql = neon(DB_URL);
  const existing = await sql`SELECT id FROM integrations WHERE id = ANY(${Object.values(IDS)}::uuid[])`;
  realFixturesPresent = existing.length > 0;
  if (realFixturesPresent) return;
  await insertTestClient(sql, { id: CLIENT_ID });
});

afterAll(async () => {
  if (!DB_URL || realFixturesPresent) return;
  await deleteTestClientCascade(neon(DB_URL), CLIENT_ID);
});

describe("e2e seed — sol-integrate", () => {
  it(
    "creates the sandbox integrations in the shape sol-integrate reads, and is safe to re-run",
    skipIfNoDb(async () => {
      if (realFixturesPresent) {
        console.warn("Skipping e2e seed test: this database already holds the real e2e fixtures (dev?)");
        return;
      }
      await seed();
      await seed();

      expect(await getIntegration(IDS.mailchimp)).toMatchObject({
        type: "mailchimp",
        status: "active",
        mailchimp: { apiKey: "abc123-us14", listId: "list42", serverPrefix: "us14" },
      });
      expect((await getIntegration(IDS.mailchimpBrokenKey)).mailchimp).toMatchObject({
        apiKey: `${"0".repeat(32)}-us14`, // built, not literal: GitHub push protection reads it as a real key
        serverPrefix: "us14",
      });
      expect(await getIntegration(IDS.sheets)).toMatchObject({
        type: "google_sheets",
        status: "active",
        googleSheets: {
          spreadsheetId: "sandbox-sheet",
          sheetName: "E2E",
          columnMapping: ["_timestamp", "name", "email", "_submissionId"],
          tableAnchor: "A1",
          googleServiceAccount: { email: "e2e@sandbox.iam.gserviceaccount.com", key: KEY_FILE },
        },
      });
      expect((await getIntegration(IDS.sheetsMissingSpreadsheet)).googleSheets.spreadsheetId).toBe(
        "1e2eSpreadsheetThatDoesNotExist000000000000"
      );
    })
  );
});

describe("solIntegrateSandboxFromEnv", () => {
  it("names the missing secret", () => {
    expect(() => solIntegrateSandboxFromEnv({ ...SANDBOX_ENV, MAILCHIMP_SANDBOX_AUDIENCE_ID: undefined })).toThrow(
      "MAILCHIMP_SANDBOX_AUDIENCE_ID environment variable is required"
    );
  });

  it("rejects a key file that isn't JSON without echoing it", () => {
    const err = (() => {
      try {
        solIntegrateSandboxFromEnv({ ...SANDBOX_ENV, GOOGLE_SHEETS_SANDBOX_SERVICE_ACCOUNT: "-----BEGIN PRIVATE KEY-----secret" });
      } catch (e) {
        return e as Error;
      }
    })();
    expect(err?.message).toBe("GOOGLE_SHEETS_SANDBOX_SERVICE_ACCOUNT must be the service account's JSON key file");
  });

  it("requires the Mailchimp key's datacenter suffix", () => {
    expect(() => solIntegrateSandboxFromEnv({ ...SANDBOX_ENV, MAILCHIMP_SANDBOX_API_KEY: "abc123" })).toThrow("-usXX");
  });
});
