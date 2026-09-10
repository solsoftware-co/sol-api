// Wave 1 of the client data model rework (see docs/design/data-model.md).
//
// Backfills google_service_accounts and slack_channels from the existing
// clients.google_service_account_email/_key and clients.slack_webhook_url
// columns, then reconciles: re-reads what was written and confirms it matches
// the source columns exactly. Nothing to backfill for integrations/
// mailchimp_integrations/google_drive_integrations — they're net-new, no
// legacy data.
//
// Idempotent: a client that already has a row in the target table is left
// alone (not overwritten, not duplicated), so this is safe to run more than
// once — including once per environment (dev, staging, production).
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { isNotNull } from "drizzle-orm";
import { clients, google_service_accounts, slack_channels } from "../src/lib/schema.js";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error("DATABASE_URL environment variable is required");

async function backfillGoogleServiceAccounts(db: ReturnType<typeof drizzle>) {
  const existing = new Set(
    (await db.select({ client_id: google_service_accounts.client_id }).from(google_service_accounts)).map(
      (r) => r.client_id
    )
  );

  const candidates = await db
    .select({
      id: clients.id,
      email: clients.google_service_account_email,
      key: clients.google_service_account_key,
    })
    .from(clients)
    .where(isNotNull(clients.google_service_account_email));

  let inserted = 0;
  let skippedExisting = 0;
  const anomalies: string[] = [];

  for (const c of candidates) {
    if (existing.has(c.id)) {
      skippedExisting++;
      continue;
    }
    if (!c.key) {
      // email set without a key (or vice versa) is an inconsistent state in
      // the current data — google_service_accounts.key is NOT NULL, so this
      // client needs manual attention rather than a guessed backfill value.
      anomalies.push(`${c.id}: google_service_account_email is set but google_service_account_key is not`);
      continue;
    }
    await db.insert(google_service_accounts).values({
      client_id: c.id,
      email: c.email!,
      key: c.key,
      name: null,
      description: null,
    });
    inserted++;
  }

  return { inserted, skippedExisting, anomalies };
}

async function backfillSlackChannels(db: ReturnType<typeof drizzle>) {
  const existing = new Set(
    (await db.select({ client_id: slack_channels.client_id }).from(slack_channels)).map((r) => r.client_id)
  );

  const candidates = await db
    .select({ id: clients.id, webhook_url: clients.slack_webhook_url })
    .from(clients)
    .where(isNotNull(clients.slack_webhook_url));

  let inserted = 0;
  let skippedExisting = 0;

  for (const c of candidates) {
    if (existing.has(c.id)) {
      skippedExisting++;
      continue;
    }
    await db.insert(slack_channels).values({
      client_id: c.id,
      name: "Default",
      description: null,
      webhook_url: c.webhook_url!,
    });
    inserted++;
  }

  return { inserted, skippedExisting };
}

async function reconcile(db: ReturnType<typeof drizzle>): Promise<string[]> {
  const failures: string[] = [];

  const googleSource = await db
    .select({ id: clients.id, email: clients.google_service_account_email, key: clients.google_service_account_key })
    .from(clients)
    .where(isNotNull(clients.google_service_account_email));
  const googleTarget = await db
    .select({ client_id: google_service_accounts.client_id, email: google_service_accounts.email, key: google_service_accounts.key })
    .from(google_service_accounts);
  const googleTargetByClient = new Map(googleTarget.map((r) => [r.client_id, r]));

  for (const c of googleSource) {
    if (!c.key) continue; // already reported as an anomaly, not a reconciliation failure
    const row = googleTargetByClient.get(c.id);
    if (!row) {
      failures.push(`${c.id}: no google_service_accounts row found`);
    } else if (row.email !== c.email || row.key !== c.key) {
      failures.push(`${c.id}: google_service_accounts row does not match clients columns`);
    }
  }

  const slackSource = await db
    .select({ id: clients.id, webhook_url: clients.slack_webhook_url })
    .from(clients)
    .where(isNotNull(clients.slack_webhook_url));
  const slackTarget = await db
    .select({ client_id: slack_channels.client_id, webhook_url: slack_channels.webhook_url })
    .from(slack_channels);
  const slackTargetByClient = new Map(slackTarget.map((r) => [r.client_id, r]));

  for (const c of slackSource) {
    const row = slackTargetByClient.get(c.id);
    if (!row) {
      failures.push(`${c.id}: no slack_channels row found`);
    } else if (row.webhook_url !== c.webhook_url) {
      failures.push(`${c.id}: slack_channels row does not match clients.slack_webhook_url`);
    }
  }

  return failures;
}

async function main() {
  const db = drizzle(neon(DATABASE_URL!));

  const google = await backfillGoogleServiceAccounts(db);
  console.log(
    `google_service_accounts: inserted ${google.inserted}, already present ${google.skippedExisting}, anomalies ${google.anomalies.length}`
  );
  for (const a of google.anomalies) console.warn(`  ANOMALY: ${a}`);

  const slack = await backfillSlackChannels(db);
  console.log(`slack_channels: inserted ${slack.inserted}, already present ${slack.skippedExisting}`);

  console.log("Reconciling backfill against source columns...");
  const failures = await reconcile(db);
  if (failures.length > 0) {
    console.error(`Reconciliation FAILED (${failures.length}):`);
    for (const f of failures) console.error(`  ${f}`);
    process.exit(1);
  }
  console.log("Reconciliation passed — every source row has a matching, correct target row.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
