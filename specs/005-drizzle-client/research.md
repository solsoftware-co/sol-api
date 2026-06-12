# Research: Drizzle ORM + Client Integration Fields

## Decision 1: Drizzle Adapter

**Decision**: Use `drizzle-orm/neon-http` with the existing `@neondatabase/serverless` package.

**Rationale**: The `neon-http` adapter runs over HTTP fetch — the same transport Cloudflare Workers already use. The alternative (`neon-serverless`) uses WebSockets, which are not persistent in Workers. No new packages are needed beyond `drizzle-orm`.

**Alternatives considered**: `drizzle-orm/neon-serverless` — rejected because WebSocket connections are not supported in the CF Workers V8 isolate.

---

## Decision 2: Migration Runner

**Decision**: Migrations are run via a local Node.js script (`scripts/migrate.ts`) using the `drizzle/migrator` API, invoked as `npm run db:migrate`.

**Rationale**: `drizzle-kit migrate` (and the programmatic migrator) requires Node.js. It cannot run inside a Cloudflare Worker. The migration script runs locally before deploy, or as a manual pre-deploy step in CI. This is the standard pattern for Neon + Drizzle.

**Alternatives considered**: Running migrations inside the Worker on startup — rejected because Workers are stateless and short-lived; migration logic would run on every cold start and has no mechanism for locking.

---

## Decision 3: Baseline Strategy for Existing Schema

**Decision**: Run `drizzle-kit pull` against the existing Neon DB to generate a `src/lib/schema.ts` baseline that reflects V001–V004. Then add the new columns to that schema and run `drizzle-kit generate` to produce only the diff (the new columns). The first Drizzle migration file will contain only the `ALTER TABLE` for the new fields.

**Rationale**: The DB already has V001–V004 applied. Drizzle must not re-run those. `drizzle-kit pull` introspects the live schema and creates a snapshot that Drizzle uses as its starting point for future diffs.

**Alternatives considered**: Hand-writing the baseline snapshot — rejected as error-prone; `drizzle-kit pull` is authoritative.

---

## Decision 4: Migration Table

**Decision**: Use a custom migration table named `sol_api_migrations` (configured in `drizzle.config.ts`).

**Rationale**: Avoids any potential conflict with the `__drizzle_migrations` default name if another project ever runs Drizzle against the same DB. Makes the owning service explicit.

---

## Decision 5: Schema File Location

**Decision**: `src/lib/schema.ts` for the Drizzle table definitions; `db/migrations/` for generated SQL migration files.

**Rationale**: `src/lib/schema.ts` co-locates the schema with the DB client (`src/lib/db.ts`). `db/migrations/` follows the convention already established by the notification service (`db/migrations/`), making the migration history easy to find.

---

## Decision 6: New Worker Secrets

**Decision**: Add `SANITY_API_TOKEN` and `GITHUB_TOKEN` as Cloudflare Worker secrets (not DB columns). These are shared credentials used by the agent workflow across all clients.

**Rationale**: Per FR-009 and the spec assumption: per-client tokens in the DB create credential sprawl and blast radius issues. A single shared token with scoped access (Sanity organisation-level, GitHub App or PAT across all repos) is simpler, easier to rotate, and never touches the database.

**Alternatives considered**: Per-client tokens in DB — rejected in spec (see FR-009).

---

## Dependencies

| Package | Type | Purpose |
|---------|------|---------|
| `drizzle-orm` | runtime dep | Query builder + type-safe schema |
| `drizzle-kit` | devDep | Migration generation CLI |
| `@neondatabase/serverless` | runtime dep (existing) | HTTP transport (unchanged) |
| `tsx` | devDep | Run migration script (`scripts/migrate.ts`) in Node.js |
