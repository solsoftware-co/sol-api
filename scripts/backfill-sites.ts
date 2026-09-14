// Wave 2 of the client data model rework (see docs/design/data-model.md).
//
// Backfills `sites` — one row per client, representing that client's sole
// existing site — from clients.ga4_property_id (and the matching
// google_service_accounts row, if any). Nothing to backfill for
// sanity_configs/github_repos: no client has sanity_project_id or
// github_repo populated today.
//
// Idempotent: a client that already has a site row is left alone (not
// overwritten, not duplicated), so this is safe to run more than once —
// including once per environment (dev, staging, production).
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { clients, google_service_accounts, sites } from "../src/lib/schema.js";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error("DATABASE_URL environment variable is required");

async function backfillSites(db: ReturnType<typeof drizzle>) {
  const existing = new Set((await db.select({ client_id: sites.client_id }).from(sites)).map((r) => r.client_id));

  const candidates = await db.select({ id: clients.id, name: clients.name, ga4_property_id: clients.ga4_property_id }).from(clients);

  const serviceAccountByClient = new Map(
    (await db.select({ client_id: google_service_accounts.client_id, id: google_service_accounts.id }).from(google_service_accounts)).map(
      (r) => [r.client_id, r.id]
    )
  );

  let inserted = 0;
  let skippedExisting = 0;

  for (const c of candidates) {
    if (existing.has(c.id)) {
      skippedExisting++;
      continue;
    }
    await db.insert(sites).values({
      client_id: c.id,
      name: c.name,
      domain: null,
      ga4_property_id: c.ga4_property_id,
      ga4_service_account_id: serviceAccountByClient.get(c.id) ?? null,
    });
    inserted++;
  }

  return { inserted, skippedExisting };
}

async function reconcile(db: ReturnType<typeof drizzle>): Promise<string[]> {
  const failures: string[] = [];

  const clientRows = await db.select({ id: clients.id, name: clients.name, ga4_property_id: clients.ga4_property_id }).from(clients);
  const siteRows = await db.select({ client_id: sites.client_id, name: sites.name, ga4_property_id: sites.ga4_property_id }).from(sites);
  const siteByClient = new Map(siteRows.map((r) => [r.client_id, r]));

  for (const c of clientRows) {
    const row = siteByClient.get(c.id);
    if (!row) {
      failures.push(`${c.id}: no sites row found`);
    } else if (row.name !== c.name || row.ga4_property_id !== c.ga4_property_id) {
      failures.push(`${c.id}: sites row does not match clients columns`);
    }
  }

  return failures;
}

async function main() {
  const db = drizzle(neon(DATABASE_URL!));

  const result = await backfillSites(db);
  console.log(`sites: inserted ${result.inserted}, already present ${result.skippedExisting}`);

  console.log("Reconciling backfill against source columns...");
  const failures = await reconcile(db);
  if (failures.length > 0) {
    console.error(`Reconciliation FAILED (${failures.length}):`);
    for (const f of failures) console.error(`  ${f}`);
    process.exit(1);
  }
  console.log("Reconciliation passed — every client has a matching, correct sites row.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
