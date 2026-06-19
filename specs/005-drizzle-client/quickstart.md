# Quickstart: Drizzle ORM + Client Integration Fields

## Prerequisites

- Neon database with V001–V004 already applied (existing)
- `DATABASE_URL` set in `.dev.vars` pointing to your dev/local Neon branch

---

## Step 1: Generate Baseline Schema

After `drizzle-kit` and `drizzle-orm` are installed, introspect the existing DB to generate a baseline schema file:

```bash
npm run db:pull
```

This runs `drizzle-kit pull` and writes `src/lib/schema.ts` reflecting the current DB state (V001–V004). Review the generated file — it should match the clients and notification_logs tables.

---

## Step 2: Add New Columns to Schema

The new columns are already added to `src/lib/schema.ts` as part of this feature. No manual edits needed after `db:pull`.

---

## Step 3: Generate the Migration

```bash
npm run db:generate
```

This runs `drizzle-kit generate` and produces a SQL migration file in `db/migrations/`. The file will contain only `ALTER TABLE` statements for the six new columns — Drizzle diffs against the baseline snapshot and generates only what's changed.

---

## Step 4: Apply the Migration

```bash
npm run db:migrate
```

This runs the Node.js migration script (`scripts/migrate.ts`) which applies all pending migrations to the database pointed at by `DATABASE_URL`. Creates the `sol_api_migrations` tracking table on first run.

Run this against your local dev Neon branch first, then against staging, then production.

---

## Step 5: Add New Worker Secrets

Add to `.dev.vars` (local):
```
SANITY_API_TOKEN=your-sanity-api-token
GITHUB_TOKEN=your-github-token
```

Add to Cloudflare Secrets for each environment:
```bash
wrangler secret put SANITY_API_TOKEN
wrangler secret put GITHUB_TOKEN
```

---

## Step 6: Verify

```bash
npm run dev
# In another terminal:
curl -X POST http://localhost:8787/v1/clients \
  -H "X-API-Key: dev-local-key" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "test-client",
    "name": "Test",
    "email": "test@example.com",
    "sanity_project_id": "abc123",
    "github_repo": "owner/repo"
  }'
```

Confirm the response includes `sanity_project_id` and `github_repo`.

---

## Ongoing Workflow: Adding Future Schema Changes

1. Edit `src/lib/schema.ts`
2. Run `npm run db:generate` — generates a new migration file
3. Run `npm run db:migrate` — applies it
4. Commit both the schema change and the migration file

---

## Available Scripts

| Script | Command | Description |
|--------|---------|-------------|
| `npm run db:pull` | `drizzle-kit pull` | Introspect DB → generate schema.ts baseline |
| `npm run db:generate` | `drizzle-kit generate` | Diff schema → generate migration SQL |
| `npm run db:migrate` | `tsx scripts/migrate.ts` | Apply pending migrations to DB |
| `npm run db:studio` | `drizzle-kit studio` | Open Drizzle Studio (browser DB viewer) |
