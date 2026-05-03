---
description: "Task list for Sol API — Hono Client Data Service"
---

# Tasks: Sol API — Hono Client Data Service

**Input**: Design documents from `specs/001-hono-client-api/`
**Prerequisites**: plan.md ✅ spec.md ✅ data-model.md ✅ contracts/api.md ✅ research.md ✅ quickstart.md ✅

**Tests**: Included — plan.md explicitly describes integration and unit tests as deliverables for
each phase.

**Organization**: Tasks are grouped by user story to enable independent implementation and
testing of each story.

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task belongs to (US1–US4)
- Exact file paths included in all descriptions

---

## Phase 1: Setup (Project Bootstrap)

**Purpose**: Initialize the Cloudflare Workers project with all tooling. No application logic —
just a skeleton that installs and compiles.

- [x] T001 Create `package.json` with runtime deps (`hono`, `@neondatabase/serverless`, `zod`) and dev deps (`wrangler`, `vitest`, `@cloudflare/vitest-pool-workers`, `typescript`, `@cloudflare/workers-types`) and scripts: `dev: wrangler dev`, `test: vitest run`, `deploy: wrangler deploy`
- [x] T002 [P] Create `wrangler.toml`: Worker name `sol-api`, `compatibility_date = "2024-09-23"`, `main = "src/index.ts"`, `[vars] ENVIRONMENT = "development"`, stub `[env.preview]` and `[env.production]` sections
- [x] T003 [P] Create `tsconfig.json` targeting CF Workers runtime: `"types": ["@cloudflare/workers-types"]`, `"moduleResolution": "bundler"`, `"strict": true`, `"jsx": "react-jsx"` (for future templates)
- [x] T004 [P] Create `vitest.config.ts` using `@cloudflare/vitest-pool-workers` pool with `wrangler.toml` as the config file path
- [x] T005 [P] Create `.gitignore` covering `.dev.vars`, `dist/`, `node_modules/`, `.wrangler/`
- [x] T006 [P] Create `.dev.vars` with placeholder secrets for local development (gitignored): `DATABASE_URL=postgres://...` and `API_KEY=dev-local-key` and `ENVIRONMENT=development`

**Checkpoint**: `npm install` succeeds; `wrangler dev` starts without errors.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared types, database client, auth middleware, error handler, app entry point,
and health route. ALL user story work is blocked until this phase is complete.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [x] T007 Define all shared TypeScript types in `src/types/index.ts`: `Env` interface (CF bindings: `DATABASE_URL: string`, `API_KEY: string`, `ENVIRONMENT: string`); `ErrorCode` enum (`UNAUTHORIZED`, `NOT_FOUND`, `VALIDATION_ERROR`, `CONFLICT`, `INTERNAL_ERROR`, `SERVICE_UNAVAILABLE`); `ApiResponse<T>` generic success/error union; `ClientRecord` interface (all columns including `google_service_account_key`); `ClientSummary` interface (all columns except `google_service_account_key`)
- [x] T008 [P] Implement Neon fetch-transport DB client in `src/lib/db.ts`: export `createDb(url: string)` returning `neon(url)` tagged-template client; export `healthCheck(sql)` running `SELECT 1` (used by health route to test connectivity)
- [x] T009 [P] Implement X-API-Key auth middleware in `src/middleware/auth.ts` using `createMiddleware` from `hono/factory`; read `X-API-Key` header; compare against `c.env.API_KEY`; throw `HTTPException(401, { message: "Unauthorized" })` if missing or invalid
- [x] T010 [P] Implement global error handler in `src/middleware/error.ts`: catch `HTTPException` and rethrow as `{ success: false, error: { code, message, details } }` envelope; catch all other errors as `INTERNAL_ERROR` 500; ensure no raw error details leak in production
- [x] T011 Create Hono app entry point in `src/index.ts`: instantiate `new Hono<{ Bindings: Env }>()`, register error handler (`app.onError`), register auth middleware on `/v1/*` routes only (health is public), import and mount `/health` and `/v1/clients` routers, export `export default app` as the Worker fetch handler
- [x] T012 Implement health route in `src/routes/health.ts`: `GET /health` (no auth); create `sql` via `createDb(c.env.DATABASE_URL)`, call `healthCheck(sql)`; on success return `200 { success: true, data: { status: "ok", database: "connected", environment: c.env.ENVIRONMENT } }`; on failure return `503` via error envelope with `SERVICE_UNAVAILABLE`
- [x] T013 [P] Write unit tests for auth middleware in `tests/unit/middleware/auth.test.ts`: valid `X-API-Key` → next() called; missing header → 401 response with `UNAUTHORIZED` code; wrong key value → 401
- [x] T014 Write integration tests for `GET /health` in `tests/integration/health.test.ts`: valid `DATABASE_URL` binding → 200 with `{ status: "ok", database: "connected" }`; bad/missing `DATABASE_URL` → 503 with `SERVICE_UNAVAILABLE` code; verify `environment` field reflects `ENVIRONMENT` binding

**Checkpoint**: `npm test` passes for T013–T014. `curl localhost:8787/health` returns `{ success: true, data: { status: "ok", database: "connected", environment: "development" } }`.

---

## Phase 3: User Story 1 — Fetch a Single Client Record (Priority: P1) 🎯 MVP

**Goal**: `GET /v1/clients/:id` returns a full `ClientRecord` (including `google_service_account_key`)
for active clients; 404 for missing or inactive.

**Independent Test**: Call `GET /v1/clients/<known-id>` with valid auth and confirm all fields
including `google_service_account_key` are returned. Call with unknown ID → 404.

- [x] T015 [P] [US1] Add `getClientById(sql, id: string): Promise<ClientRecord | null>` to `src/lib/db.ts`: `SELECT` all columns including `google_service_account_key` `FROM clients WHERE id = $1 AND active = TRUE`; return `null` when no rows
- [x] T016 [US1] Implement `GET /v1/clients/:id` handler in `src/routes/clients.ts`: extract `id` from params, call `getClientById`; if null return 404 `NOT_FOUND` via error envelope; otherwise return 200 `{ success: true, data: clientRecord }`
- [x] T017 [US1] Mount clients router in `src/index.ts` under `/v1/clients` (auth middleware already applied to `/v1/*`)
- [x] T018 [P] [US1] Write integration tests for `GET /v1/clients/:id` in `tests/integration/clients.test.ts`: active client → 200 + full `ClientRecord` with `google_service_account_key` present; non-existent ID → 404 `NOT_FOUND`; inactive client (seed with `active = false`) → 404; request without `X-API-Key` → 401 `UNAUTHORIZED`

**Checkpoint**: User Story 1 fully functional — all T018 integration tests pass independently.

---

## Phase 4: User Story 2 — List All Active Clients (Priority: P2)

**Goal**: `GET /v1/clients` returns a `ClientSummary[]` of active clients, supporting `testOnly`
and `limit` query params. `google_service_account_key` is absent from all list responses.

**Independent Test**: Call `GET /v1/clients` and confirm only active clients appear, each without
`google_service_account_key`. Verify `testOnly=true` filters to test-email clients only.

- [x] T019 [P] [US2] Add `listClients(sql, opts: { limit?: number }): Promise<ClientSummary[]>` to `src/lib/db.ts`: `SELECT` all columns **except** `google_service_account_key` `WHERE active = TRUE`; when `limit` is set append `LIMIT $n`
- [x] T020 [US2] Implement `GET /v1/clients` handler in `src/routes/clients.ts`: parse `limit` (string → integer, validate > 0) from query params; call `listClients`; return 200 `{ success: true, data: clientSummaries }` (empty array is a valid 200, not 404)
- [x] T021 [P] [US2] Write integration tests for `GET /v1/clients` in `tests/integration/clients.test.ts`: multiple clients (active + inactive seeded) → only active returned; empty database → `200 []`; `limit=1` → at most 1 record; no `X-API-Key` → 401; assert `google_service_account_key` is `undefined` in every response item

**Checkpoint**: User Story 2 fully functional — all T021 integration tests pass. US1 still passes.

---

## Phase 5: User Story 3 — Create a New Client (Priority: P3)

**Goal**: `POST /v1/clients` validates the payload, persists the new client, and returns the
created `ClientRecord` with 201. Returns 422 on validation failure, 409 on duplicate ID.

**Independent Test**: POST a valid payload → 201 + new record. Immediately `GET /v1/clients/<id>`
and confirm the record is present.

- [x] T022 [P] [US3] Define `createClientSchema` Zod schema in `src/validators/client.ts`: `id` (string, min 1, max 100, regex `/^\S+$/` no spaces); `name` (string, min 1, max 200); `email` (string, must include `@`); `timezone` (optional enum: `"America/New_York" | "America/Chicago" | "America/Denver" | "America/Los_Angeles"`); `settings` (optional `z.record(z.unknown())`, default `{}`); `ga4_property_id` (optional string or null); `google_service_account_email` (optional string or null); `google_service_account_key` (optional string or null)
- [x] T023 [P] [US3] Write unit tests for `createClientSchema` in `tests/unit/validators/client.test.ts`: full valid payload passes; missing `id` → parse error; missing `email` → parse error; missing `name` → parse error; invalid timezone string → parse error; `id` with spaces → parse error; settings defaults to `{}`
- [x] T024 [P] [US3] Add `insertClient(sql, data: z.infer<typeof createClientSchema>): Promise<ClientRecord>` to `src/lib/db.ts`: `INSERT INTO clients (...) VALUES (...) RETURNING *`; catch Postgres unique-violation error code `23505` and rethrow as a typed `CONFLICT` error
- [x] T025 [US3] Implement `POST /v1/clients` handler in `src/routes/clients.ts`: parse body with `createClientSchema.safeParse()`; on failure return 422 `VALIDATION_ERROR` with Zod issues as `details`; call `insertClient`; on CONFLICT error return 409 `CONFLICT`; on success return 201 `{ success: true, data: newClientRecord }`
- [x] T026 [P] [US3] Write integration tests for `POST /v1/clients` in `tests/integration/clients.test.ts`: valid full payload → 201 + record, follow-up GET confirms client exists; missing `id` → 422 with `details`; missing `email` → 422; duplicate ID (insert twice) → 409 `CONFLICT`; invalid timezone → 422; no `X-API-Key` → 401

**Checkpoint**: User Story 3 fully functional — all T026 integration tests pass. US1 + US2 still pass.

---

## Phase 6: User Story 4 — Update a Client Record (Priority: P4)

**Goal**: `PATCH /v1/clients/:id` applies a partial update — only provided fields are changed.
Returns 200 + updated `ClientRecord`, 404 for missing client, 422 for invalid values.

**Independent Test**: Update a single field on an existing client. `GET /v1/clients/:id` confirms
only that field changed; other fields are unmodified.

- [x] T027 [P] [US4] Define `updateClientSchema` Zod schema in `src/validators/client.ts`: all fields optional (same types as create, no `id`); add `.refine()` ensuring at least one field is provided
- [x] T028 [P] [US4] Write unit tests for `updateClientSchema` in `tests/unit/validators/client.test.ts`: single-field update (e.g., `{ email: "new@x.com" }`) passes; full update passes; empty object `{}` → refine error; invalid timezone → parse error
- [x] T029 [P] [US4] Add `updateClient(sql, id: string, data: z.infer<typeof updateClientSchema>): Promise<ClientRecord | null>` to `src/lib/db.ts`: build `SET` clause dynamically from only the keys present in `data` (use parameterized query, not string interpolation); `WHERE id = $n RETURNING *`; return `null` if no rows updated (client not found)
- [x] T030 [US4] Implement `PATCH /v1/clients/:id` handler in `src/routes/clients.ts`: parse body with `updateClientSchema.safeParse()`; on failure return 422 `VALIDATION_ERROR`; call `updateClient`; if null return 404 `NOT_FOUND`; on success return 200 `{ success: true, data: updatedClientRecord }`
- [x] T031 [P] [US4] Write integration tests for `PATCH /v1/clients/:id` in `tests/integration/clients.test.ts`: update `email` only → GET confirms email changed, name unchanged; update to valid timezone → 200 accepted; invalid timezone → 422; non-existent client ID → 404; no `X-API-Key` → 401

**Checkpoint**: User Story 4 fully functional — all T031 integration tests pass. US1–US3 still pass.

---

## Phase 7: Polish & Deployment

**Purpose**: Hardening, CI, and deployment to Cloudflare Workers.

- [x] T032 [P] Expand `wrangler.toml` with fully populated `[env.preview]` and `[env.production]` sections: set `ENVIRONMENT = "preview"` / `"production"` respectively; note that `DATABASE_URL` and `API_KEY` are secrets (not in toml)
- [x] T033 [P] Create GitHub Actions workflow in `.github/workflows/ci.yml`: trigger on `push` to `main` and `pull_request`; steps: `checkout`, `setup-node`, `npm ci`, `npm test`
- [x] T034 [P] Create `README.md` with: project overview, prerequisites, local setup (clone → npm install → .dev.vars → wrangler dev), available npm scripts, endpoint summary table (method, path, auth, description)
- [x] T035 Update `specs/001-hono-client-api/quickstart.md` to add `wrangler secret put DATABASE_URL` and `wrangler secret put API_KEY` deploy steps for preview and production environments
- [ ] T036 Deploy to Cloudflare Workers production environment and verify `GET /v1/clients` returns real client data from the Neon production branch

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately; tasks T002–T006 are all parallel
- **Foundational (Phase 2)**: Depends on Phase 1 (npm install must complete). T007 must run first; T008–T010 can then run in parallel; T011–T012 follow; T013–T014 are final validation
- **User Stories (Phase 3–6)**: All depend on Foundational phase completion
- **Polish (Phase 7)**: Depends on all desired user story phases being complete

### User Story Dependencies

- **US1 (P1)**: Can start immediately after Foundational. No dependency on US2–US4.
- **US2 (P2)**: Can start after Foundational. Independent of US1 (different query, same route file — implement sequentially or branch).
- **US3 (P3)**: Can start after Foundational. Independent of US1/US2.
- **US4 (P4)**: Can start after Foundational. Independent of US1–US3 (but PATCH is in same route file as earlier routes — add to existing file).

### Within Each User Story

- DB query function → before route handler (handler depends on query)
- Zod schema → before route handler (handler depends on schema)
- Route handler → before integration tests (tests call the route)
- Unit tests on schemas/middleware can run in parallel with other user story work

---

## Parallel Opportunities

### Phase 2 (Foundational)

```
T007 (types — blocking)
  ├── T008 [P] src/lib/db.ts (health check query)
  ├── T009 [P] src/middleware/auth.ts
  └── T010 [P] src/middleware/error.ts
        └── T011 src/index.ts (wires all above)
              └── T012 src/routes/health.ts
                    ├── T013 [P] tests/unit/middleware/auth.test.ts
                    └── T014    tests/integration/health.test.ts
```

### Phase 3 (US1) — parallel opportunities

```
T015 [P] src/lib/db.ts (getClientById query)
  └── T016 src/routes/clients.ts (GET /:id handler)
        └── T017 src/index.ts (mount router)
              └── T018 [P] tests/integration/clients.test.ts (US1 tests)
```

### Phase 5 (US3) — maximum parallelism

```
T022 [P] src/validators/client.ts (createClientSchema)
T023 [P] tests/unit/validators/client.test.ts (schema tests — can write spec before impl)
T024 [P] src/lib/db.ts (insertClient query)
  All three → T025 src/routes/clients.ts (POST handler — needs schema + query)
                └── T026 [P] tests/integration/clients.test.ts (US3 tests)
```

---

## Implementation Strategy

### MVP (User Story 1 Only)

1. Complete Phase 1 (Setup)
2. Complete Phase 2 (Foundational — CRITICAL, blocks everything)
3. Complete Phase 3 (US1 — single client fetch)
4. **STOP and VALIDATE**: `GET /v1/clients/:id` returns correct shape; tests pass
5. Notification service can already be pointed at this API for client config lookups

### Incremental Delivery

1. Phase 1 + 2 → skeleton + health + auth working
2. Phase 3 (US1) → single-client fetch live; notification service can migrate
3. Phase 4 (US2) → list endpoint live; scheduler fan-outs can migrate
4. Phase 5 (US3) → create endpoint live; onboarding can use API
5. Phase 6 (US4) → update endpoint live; full CRUD complete
6. Phase 7 → CI + deployment hardened

### Notes

- `[P]` tasks involve different files and have no incomplete dependencies — safe to parallelize
- `[Story]` label maps each task to its user story for traceability
- Integration tests use `app.request()` pattern from `@cloudflare/vitest-pool-workers` — no HTTP server needed
- Seed test data in test setup/teardown hooks; avoid shared test state between stories
- Commit after each checkpoint to preserve independently working increments
