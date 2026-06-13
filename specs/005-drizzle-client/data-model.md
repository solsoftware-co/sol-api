# Data Model: Drizzle ORM + Client Integration Fields

## Clients Table (Extended)

All existing columns are unchanged. New columns are nullable with no backfill required.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| `id` | TEXT | NO | — | Human-assigned slug (e.g. `acme-corp`). Primary key. |
| `name` | TEXT | NO | — | Display name |
| `email` | TEXT | NO | — | Primary contact email |
| `ga4_property_id` | TEXT | YES | NULL | |
| `active` | BOOLEAN | NO | TRUE | Inactive clients excluded from list + single-record lookups |
| `settings` | JSONB | NO | `{}` | Generic key-value store |
| `created_at` | TIMESTAMPTZ | NO | NOW() | |
| `google_service_account_email` | TEXT | YES | NULL | |
| `google_service_account_key` | TEXT | YES | NULL | **Excluded from list responses at query level** |
| `timezone` | TEXT | NO | `America/Chicago` | One of four supported timezones |
| `sanity_project_id` | TEXT | YES | NULL | **NEW** — Sanity project ID for this client's CMS |
| `sanity_production_dataset` | TEXT | YES | NULL | **NEW** — Sanity dataset for production content (e.g. `production`) |
| `sanity_staging_dataset` | TEXT | YES | NULL | **NEW** — Sanity dataset for staging content (e.g. `staging`) |
| `github_repo` | TEXT | YES | NULL | **NEW** — GitHub repo slug (e.g. `owner/repo`) |
| `github_default_branch` | TEXT | NO | `main` | **NEW** — Target branch for production code changes |
| `github_test_branch` | TEXT | YES | NULL | **NEW** — Target branch for staging/test code changes |

## Drizzle Schema (`src/lib/schema.ts`)

Defines the `clients` table using Drizzle's `pgTable` builder. This file is the single source of truth for the schema going forward — `drizzle-kit generate` diffs against it to produce migration SQL.

## Migration File (`db/migrations/`)

Drizzle-generated SQL files live here. The first migration (`0000_*.sql`) contains only the `ALTER TABLE` statements for the six new columns. V001–V004 (from `sol-notification-service`) are historical and already applied — Drizzle does not manage them.

## Migration Tracking

Drizzle uses a `sol_api_migrations` table (custom name, configured in `drizzle.config.ts`) to track which migrations have been applied. This table is created automatically on first run.

## New Worker Environment Bindings

These are Cloudflare Worker secrets — not database columns.

| Binding | Description |
|---------|-------------|
| `SANITY_API_TOKEN` | Shared Sanity API token with access to all client projects |
| `GITHUB_TOKEN` | Shared GitHub token (PAT or GitHub App) with access to all client repos |

These must be added to:
- `.dev.vars` (local development)
- Cloudflare Secrets per environment (`wrangler secret put`)
- `wrangler.toml` `[vars]` section (non-secret placeholder only, no values)

## TypeScript Types (`src/types/index.ts`)

`ClientRecord` must be extended with the six new fields. `Env` bindings interface must be extended with `SANITY_API_TOKEN` and `GITHUB_TOKEN`.

## Validation (`src/validators/client.ts`)

`createClientSchema` and `updateClientSchema` must be extended with the six new optional fields. All are `z.string().nullable().optional()` except `github_default_branch` which defaults to `"main"` on create.
