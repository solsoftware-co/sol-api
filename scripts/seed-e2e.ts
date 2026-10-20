import { neon } from "@neondatabase/serverless";
import { solIntegrateSandboxFromEnv, solIntegrateSeedQueries } from "../db/seeds/e2e/sol-integrate.js";

// Seeds the fixtures other services' PR-preview e2e suites need into the
// database at DATABASE_URL — the persistent `dev` branch (sol-api-dev), which
// those previews' SOL_API bindings point at. Run by release.yml's deploy-dev
// job on every merge to main, and by seed-dev.yml on demand.
//
//   DATABASE_URL=… MAILCHIMP_SANDBOX_API_KEY=… … npm run db:seed:e2e
//
// One section per consuming service, each in db/seeds/e2e/. Everything is an
// upsert on fixed IDs, so it's safe to re-run. Only ever point this at dev:
// the rows hold sandbox credentials and are meaningless anywhere else.

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error("DATABASE_URL environment variable is required");

const CLIENT_ID = "sol";

async function main() {
  const sql = neon(DATABASE_URL!);

  const [client] = await sql`SELECT id FROM clients WHERE id = ${CLIENT_ID}`;
  if (!client) throw new Error(`Client "${CLIENT_ID}" doesn't exist in this database — the e2e fixtures belong to it`);

  await sql.transaction(solIntegrateSeedQueries(sql, solIntegrateSandboxFromEnv(process.env), CLIENT_ID));
  console.log("Seeded sol-integrate's e2e fixtures (2 Mailchimp, 2 Google Sheets integrations).");
}

main().catch((err) => {
  // The message only, never a dump of the env — it holds sandbox keys.
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
