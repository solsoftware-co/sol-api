# Implementation Plan: Drizzle ORM + Client Integration Fields

**Branch**: `feat/005-drizzle-client` | **Date**: 2026-06-08 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `specs/005-drizzle-client/spec.md`

## Summary

Migrate the data access layer from raw Neon SQL to Drizzle ORM (`drizzle-orm/neon-http` adapter), establish a versioned migration workflow for all future schema changes, and extend the `clients` table with six new fields supporting Sanity CMS and GitHub integration for the email-triggered agent workflow. Two new worker secrets (`SANITY_API_TOKEN`, `GITHUB_TOKEN`) replace any notion of per-client credential storage.

## Technical Context

**Language/Version**: TypeScript 5.x / Node 20
**Primary Dependencies**: Hono 4.x, Wrangler 3.x, `drizzle-orm` ^0.38.x (runtime), `drizzle-kit` ^0.30.x (devDep), `@neondatabase/serverless` ^1.x (unchanged), `tsx` (devDep, migration runner)
**Storage**: Neon PostgreSQL — existing `clients` table (V001–V004 applied by `sol-notification-service`); Drizzle owns all future migrations via `sol_api_migrations` tracking table
**Testing**: Vitest + `@cloudflare/vitest-pool-workers` (existing)
**Target Platform**: Cloudflare Workers (V8 isolate)
**Project Type**: REST API — data layer migration + schema extension
**Performance Goals**: No regression from current < 200ms p95 (Drizzle neon-http is equivalent to raw neon() HTTP)
**Constraints**: Migrations run in Node.js only (not inside Worker); `drizzle-kit` CLI is dev-only
**Scale/Scope**: One table, six new nullable columns, two new worker secrets

## Constitution Check

| Principle | Status | Notes |
|-----------|--------|-------|
| I. REST-First Design | ✅ Pass | No changes to routes or response envelope shape |
| II. Multi-Environment Safety | ✅ Pass | `SANITY_API_TOKEN` and `GITHUB_TOKEN` added as Cloudflare Secrets per environment; `DATABASE_URL` per-environment unchanged |
| III. Sensitive Data Protection | ✅ Pass | No per-client tokens in DB; agent credentials are worker secrets only; `google_service_account_key` exclusion continues |
| IV. Response Shape & Observability | ✅ Pass | New fields added to responses; all existing shapes preserved |
| V. AI-Agent Friendly Codebase | ✅ Pass | Schema-first approach; `src/lib/schema.ts` is the new source of truth; spec exists before implementation |
| VI. Minimal Infrastructure & DX | ⚠️ MINOR amendment | Adding `drizzle-orm` + `drizzle-kit` to approved stack (see Complexity Tracking) |

**Post-design re-check**: No violations. Constitution MINOR amendment required (see below).

## Constitution Amendment Required

**Version bump**: 2.1.0 → 2.2.0 (MINOR — new technology added to stack)
**Affected principle**: VI Technology Stack
**Change**: Add `drizzle-orm` ^0.38.x (runtime) and `drizzle-kit` ^0.30.x (devDep) to the approved Technology Stack table.
**Rationale**: Drizzle is required to fulfil US2 (versioned migration workflow). The raw `@neondatabase/serverless` driver remains as the underlying transport — Drizzle wraps it, not replaces it.

## Project Structure

### Documentation (this feature)

```text
specs/005-drizzle-client/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── contracts/
│   └── api.md           # Updated endpoint contracts
├── quickstart.md        # Migration workflow guide
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code Changes

```text
src/
├── lib/
│   ├── db.ts            # MODIFIED — returns Drizzle client (neon-http adapter) instead of raw neon()
│   └── schema.ts        # NEW — Drizzle pgTable definition for clients (generated via db:pull, then extended)
├── routes/
│   └── clients.ts       # MODIFIED — replace raw SQL with Drizzle queries
├── types/
│   └── index.ts         # MODIFIED — extend ClientRecord + Env bindings (SANITY_API_TOKEN, GITHUB_TOKEN)
└── validators/
    └── client.ts        # MODIFIED — add 6 new optional fields to create/update schemas

db/
└── migrations/          # NEW — Drizzle-generated SQL migration files (0000_*.sql)

scripts/
└── migrate.ts           # NEW — Node.js migration runner (tsx scripts/migrate.ts)

drizzle.config.ts        # NEW — drizzle-kit config (schema, out dir, dialect, migration table name)
```

**Structure Decision**: Schema file at `src/lib/schema.ts` co-located with the DB client. Migration files at `db/migrations/` following the existing project convention. Separate `scripts/` directory for the Node.js migration runner (keeps it out of `src/` which is Worker-only code).

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| MINOR amendment: add Drizzle ORM to Technology Stack | US2 requires a versioned migration workflow; US1 and US3 benefit from type-safe queries as schema grows | Raw SQL with manual `ALTER TABLE` provides no type safety and no migration audit trail; schema will continue to grow with future agent features |

---

## Phase 1: Install Drizzle + Establish Baseline

**Goal**: Install dependencies, generate baseline schema from existing DB, add new columns, generate first migration.

**Steps**:
1. Install `drizzle-orm` (runtime), `drizzle-kit` and `tsx` (devDeps)
2. Add `drizzle.config.ts` at repo root — dialect `postgresql`, schema `./src/lib/schema.ts`, out `./db/migrations`, migration table `sol_api_migrations`
3. Add npm scripts: `db:pull`, `db:generate`, `db:migrate`, `db:studio`
4. Run `npm run db:pull` to introspect the live DB and generate `src/lib/schema.ts`
5. Add six new columns to the Drizzle schema in `src/lib/schema.ts`
6. Run `npm run db:generate` to generate `db/migrations/0000_*.sql`
7. Write `scripts/migrate.ts` using Drizzle's `migrate()` API
8. Run `npm run db:migrate` against local dev Neon branch to verify

**Checkpoint**: Migration applies cleanly; `src/lib/schema.ts` reflects full schema; new columns exist in DB.

---

## Phase 2: Update Data Layer

**Goal**: Replace raw `neon()` SQL in `src/lib/db.ts` and `src/routes/clients.ts` with Drizzle queries.

**Steps**:
1. Update `src/lib/db.ts` — export a `createDb(url)` factory that returns a Drizzle client using `drizzle(neon(url))`
2. Update `src/types/index.ts` — extend `ClientRecord` with 6 new fields; add `SANITY_API_TOKEN` and `GITHUB_TOKEN` to `Env`
3. Update `src/validators/client.ts` — add 6 new optional fields to `createClientSchema` and `updateClientSchema`
4. Update `src/routes/clients.ts` — replace all raw SQL with Drizzle queries using the schema; maintain identical response shapes and `google_service_account_key` exclusion

**Checkpoint**: All existing tests pass; new fields round-trip correctly via Bruno.

---

## Phase 3: Verification

- [ ] Run full test suite — all existing tests pass
- [ ] Create a client with all new fields; confirm they are returned on GET
- [ ] Confirm `google_service_account_key` still absent from list responses
- [ ] Add `SANITY_API_TOKEN` and `GITHUB_TOKEN` to `.dev.vars`; confirm health check still passes
- [ ] Run `npm run db:generate` with no schema changes — confirm no new migration is produced (clean state)
