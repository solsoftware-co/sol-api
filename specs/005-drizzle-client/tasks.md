# Tasks: Drizzle ORM + Client Integration Fields

**Input**: Design documents from `specs/005-drizzle-client/`
**Branch**: `feat/005-drizzle-client`

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on each other)
- **[Story]**: Maps to user story from spec.md (US1, US2, US3)

---

## Phase 1: Setup

**Purpose**: Install Drizzle dependencies and configuration before any story work begins

- [X] T001 Install `drizzle-orm` (runtime) and `drizzle-kit`, `tsx` (devDeps) in `package.json` — run `npm install`
- [X] T002 Create `drizzle.config.ts` at repo root — dialect `postgresql`, schema `./src/lib/schema.ts`, out `./db/migrations`, migrations table `sol_api_migrations`
- [X] T003 Add `db:pull`, `db:generate`, `db:migrate`, `db:studio` scripts to `package.json`

---

## Phase 2: Foundational (Blocking Prerequisite)

**Purpose**: Establish baseline schema and migration runner — MUST be complete before US1 or US3 can proceed

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T004 [US2] Run `npm run db:pull` to introspect existing Neon DB and generate baseline `src/lib/schema.ts` reflecting V001–V004 — review output matches `clients` and `notification_logs` tables
- [X] T005 [US2] Create `scripts/migrate.ts` — Node.js migration runner using `migrate()` from `drizzle-orm/migrator`; reads `DATABASE_URL` from env; targets `db/migrations/`
- [X] T006 [US2] Update `src/lib/db.ts` — replace raw `neon()` export with `createDb(url: string)` factory that returns `drizzle(neon(url))` using `drizzle-orm/neon-http` adapter; update all call sites in `src/routes/clients.ts` and `src/routes/health.ts`

**Checkpoint**: `src/lib/schema.ts` exists and reflects the full current schema; `npm run db:migrate` runs without error against local dev DB; existing `npm test` still passes

---

## Phase 3: User Story 1 — New Integration Fields (Priority: P1) 🎯 MVP

**Goal**: Six new Sanity + GitHub config fields on the client entity, fully round-trippable via the API

**Independent Test**: `POST /v1/clients` with all new fields → `GET /v1/clients/:id` returns them all; `PATCH` updates one → others unchanged; omitting new fields on create succeeds

### Implementation for User Story 1

- [X] T007 [P] [US1] Extend `src/lib/schema.ts` — add `sanity_project_id`, `sanity_production_dataset`, `sanity_staging_dataset`, `github_repo`, `github_default_branch` (default `'main'`), `github_test_branch` as nullable text columns to the clients table definition
- [X] T008 [P] [US1] Update `src/types/index.ts` — extend `ClientRecord` with 6 new nullable string fields; add `SANITY_API_TOKEN: string` and `GITHUB_TOKEN: string` to `Env` bindings interface
- [X] T009 [P] [US1] Update `src/validators/client.ts` — add 6 new optional fields to `createClientSchema` (all `z.string().nullable().optional()`; `github_default_branch` defaults to `"main"`) and `updateClientSchema`
- [X] T010 [US1] Run `npm run db:generate` to produce first Drizzle migration SQL file in `db/migrations/` — confirm it contains only `ALTER TABLE` for the 6 new columns (depends on T007)
- [ ] T011 [US1] Run `npm run db:migrate` to apply the migration to local dev Neon branch — confirm new columns exist (depends on T010) — **USER ACTION REQUIRED**: run with DATABASE_URL in shell
- [X] T012 [US1] Update `src/routes/clients.ts` — include all 6 new fields in list response columns and single-record response; maintain `google_service_account_key` exclusion from list query at the Drizzle query level (depends on T007, T008, T009)
- [X] T013 [US1] Add `SANITY_API_TOKEN` and `GITHUB_TOKEN` to `.dev.vars` (local placeholder values) and add non-secret placeholder entries to `wrangler.toml` `[vars]` section

**Checkpoint**: US1 complete — new fields persist and are returned correctly; existing fields unaffected

---

## Phase 4: User Story 3 — Backwards Compatibility (Priority: P3)

**Goal**: All existing tests pass unchanged; response shapes and error codes identical before and after the migration

**Independent Test**: Run `npm test` — all tests pass with no modifications

### Implementation for User Story 3

- [X] T014 [US3] Run `npm test` — confirm all existing integration tests pass without modification (depends on T006, T012)
- [ ] T015 [US3] Verify `GET /v1/clients` list response excludes `google_service_account_key` — confirm via `curl` or Bruno against local dev server — **USER ACTION REQUIRED**: verify after T011
- [ ] T016 [US3] Verify `GET /v1/clients/:id` response includes all new fields — confirm via Bruno using updated `Get Client.bru` — **USER ACTION REQUIRED**: verify after T011

**Checkpoint**: US3 complete — zero regressions; all existing contracts preserved

---

## Phase 5: Polish & Cross-Cutting Concerns

- [X] T017 [P] Update `bruno/Clients/Create Client.bru` and `bruno/Clients/Update Client.bru` — add new fields to request bodies
- [ ] T018 [P] Run `npm run db:generate` with no schema changes — confirm no spurious migration file is produced (clean state verification) — **USER ACTION REQUIRED**: run after T011
- [X] T019 Update `.specify/memory/constitution.md` — MINOR amendment 2.1.0 → 2.2.0 adding `drizzle-orm` and `drizzle-kit` to the Technology Stack table

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Phase 1; BLOCKS all user stories
- **US1 (Phase 3)**: Depends on Phase 2 (schema.ts baseline + db.ts updated)
- **US3 (Phase 4)**: Depends on Phase 3 (Drizzle queries + new fields in place)
- **Polish (Phase 5)**: Depends on US1 and US3 complete

### User Story Dependencies

- **US2 (P2)**: Foundational — T004–T006 must complete before any route work
- **US1 (P1)**: Requires US2 complete. T007, T008, T009 are parallel (different files). T010/T011 sequential (generate then apply). T012 depends on T007/T008/T009.
- **US3 (P3)**: Requires US1 complete. T014–T016 are verifications, can run in any order.

### Parallel Opportunities

- **T007, T008, T009** (US1 schema + types + validators): three different files, no inter-dependencies
- **T017, T018** (polish): independent
- **T014, T015, T016** (US3 verification): independent checks

---

## Parallel Example: User Story 1

```bash
# T007, T008, T009 can all run simultaneously:
Task: "Extend src/lib/schema.ts with 6 new columns"
Task: "Extend src/types/index.ts with new fields + Env bindings"
Task: "Extend src/validators/client.ts with new optional fields"

# Then sequentially:
Task: "npm run db:generate → db/migrations/0000_*.sql"  (T010, depends on T007)
Task: "npm run db:migrate → apply to local DB"          (T011, depends on T010)
Task: "Update src/routes/clients.ts"                    (T012, depends on T007/T008/T009)
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: T001–T003
2. Complete Phase 2: T004–T006 (foundational — required)
3. Complete Phase 3: T007–T013 (US1 — new fields live)
4. **STOP and VALIDATE**: new fields round-trip via Bruno; `npm test` passes
5. Ship — agent workflow can now store Sanity + GitHub config per client

### Incremental Delivery

1. Setup (T001–T003) → foundation installed
2. Foundational (T004–T006) → Drizzle live, raw SQL replaced
3. US1 (T007–T013) → new fields available
4. US3 (T014–T016) → verified zero regressions
5. Polish (T017–T019) → Bruno updated, constitution amended

---

## Notes

- T004 (`db:pull`) generates `src/lib/schema.ts` from the live DB — must run against a DB that has V001–V004 applied
- T010 (`db:generate`) diffs the updated `schema.ts` against the baseline snapshot — output should be ONLY the 6 new columns
- T011 (`db:migrate`) creates `sol_api_migrations` tracking table on first run — expected behaviour
- Historical migrations (V001–V004) live in `db/migrations/historical/` — Drizzle does not manage these
- `SANITY_API_TOKEN` and `GITHUB_TOKEN` are shared worker secrets — not per-client DB columns (per FR-009)
