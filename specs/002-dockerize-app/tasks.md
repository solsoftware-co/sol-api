# Tasks: Docker Local Development Environment

**Input**: Design documents from `specs/002-dockerize-app/`  
**Branch**: `002-dockerize-app`

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on each other)
- **[Story]**: Maps to user story from spec.md (US1, US2, US3)

---

## Phase 1: Setup

**Purpose**: Prerequisites for all image builds — must exist before any `docker compose build`

- [x] T001 Create `.dockerignore` at repo root (exclude `node_modules`, `.dev.vars`, `.git`, `dist`, `*.log`)

---

## Phase 2: Foundational (Blocking Prerequisite)

**Purpose**: `wrangler dev` must bind to `0.0.0.0` or the API is unreachable from outside the container. This change also applies when running `npm run dev` directly — no harm outside Docker.

**⚠️ CRITICAL**: No user story work can begin until this change is in place

- [x] T002 Add `[dev]` section to `wrangler.toml` — set `ip = "0.0.0.0"` and `port = 8787`

**Checkpoint**: `wrangler.toml` change in place — image builds can now proceed

---

## Phase 3: User Story 1 — Start API with Docker (Priority: P1) 🎯 MVP

**Goal**: Developer runs `docker compose up` and the API responds at `http://localhost:8787`

**Independent Test**: `docker compose up --build` → `curl http://localhost:8787/health` returns a `200` response

### Implementation for User Story 1

- [x] T003 [P] [US1] Create `Dockerfile` at repo root — `node:20-slim` base, `ENV CI=true`, `COPY package*.json` + `RUN npm ci`, `COPY wrangler.toml tsconfig.json vitest.config.ts ./`, `EXPOSE 8787`, `CMD ["npx", "wrangler", "dev"]`
- [x] T004 [P] [US1] Create `docker-compose.yml` at repo root — `api` service: `build: .`, `ports: ["8787:8787"]`, `env_file: .dev.vars`, `volumes: [./src:/app/src, ./tests:/app/tests]`
- [ ] T005 [US1] Verify US1: run `docker compose up --build`, confirm API responds at `http://localhost:8787/health` and source changes in `src/` hot-reload without restarting the container (depends on T001, T002, T003, T004)

**Checkpoint**: US1 complete — API starts, hot-reloads, and reads secrets from `.dev.vars`

---

## Phase 4: User Story 2 — Run Tests in Docker (Priority: P2)

**Goal**: Developer runs `docker compose run --rm test` and the full Vitest suite executes inside the container

**Independent Test**: `docker compose run --rm test` exits with the same pass/fail result as `npm test` outside Docker

### Implementation for User Story 2

- [x] T006 [US2] Add `test` service to existing `docker-compose.yml` — same build context as `api`, `env_file: .dev.vars`, volumes `./src:/app/src` and `./tests:/app/tests`, `command: ["npx", "vitest", "run"]`, `profiles: [test]`
- [ ] T007 [US2] Verify US2: run `docker compose run --rm test`, confirm all tests pass and exit code matches a direct `npm test` run (depends on T006)

**Checkpoint**: US2 complete — tests runnable in Docker with identical results to host

---

## Phase 5: User Story 3 — Env Var Configuration (Priority: P3)

**Goal**: Secrets are never baked into the image; changing `.dev.vars` and restarting the container loads new values

**Independent Test**: Modify `API_KEY` in `.dev.vars`, run `docker compose up`, confirm the new key is required for authenticated requests

**Note**: US3's implementation is fully embedded in T001 (`.dockerignore` excludes `.dev.vars`) and T004 (`env_file:` injects vars at runtime). The tasks below are verification only.

### Verification for User Story 3

- [ ] T008 [US3] Verify US3 secrets isolation: run `docker image inspect` and confirm `.dev.vars` contents are absent from all image layers (depends on T003, T004)
- [ ] T009 [US3] Verify US3 runtime injection: change `API_KEY` in `.dev.vars`, run `docker compose up`, confirm old key is rejected and new key is accepted (depends on T004)

**Checkpoint**: All three user stories complete and independently verified

---

## Phase 6: Polish & Cross-Cutting Concerns

- [x] T010 [P] Update `quickstart.md` in `specs/002-dockerize-app/` with any corrections found during verification
- [x] T011 [P] Confirm `.dev.vars` is present in `.gitignore` (add if missing)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 (T001 must exist before building)
- **US1 (Phase 3)**: Depends on T001 + T002 — T003 and T004 can run in parallel with each other
- **US2 (Phase 4)**: Depends on US1 being verified (T005) — adds to `docker-compose.yml`
- **US3 (Phase 5)**: Depends on T003 + T004 — can overlap with US2
- **Polish (Phase 6)**: Depends on all verifications passing

### User Story Dependencies

- **US1 (P1)**: Requires Foundational (T002). Core deliverable — blocks US2 and US3 verification.
- **US2 (P2)**: Requires US1 verified (T005). Adds one service to existing `docker-compose.yml`.
- **US3 (P3)**: Requires T003 + T004. No new files — verification of US1 properties.

### Parallel Opportunities

- **T003 and T004** can be written simultaneously — different files (`Dockerfile` vs `docker-compose.yml`)
- **T010 and T011** can run in parallel — different files
- **T008 and T009** can run in parallel — independent verification steps

---

## Parallel Example: User Story 1

```bash
# T003 and T004 can be created at the same time:
Task: "Create Dockerfile at repo root"
Task: "Create docker-compose.yml at repo root"

# Then T005 (verify) after both are done
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: T001
2. Complete Phase 2: T002
3. Complete Phase 3: T003 → T004 (parallel) → T005 (verify)
4. **STOP and VALIDATE**: `docker compose up --build` + health check
5. Ship — developers can now use Docker for local dev

### Incremental Delivery

1. T001 + T002 → foundation ready (2 files)
2. T003 + T004 + T005 → US1 complete (add `Dockerfile` + `docker-compose.yml`)
3. T006 + T007 → US2 complete (add `test` service to compose)
4. T008 + T009 → US3 verified (no new files)
5. T010 + T011 → polish

**Total**: 11 tasks, 4 new files, 1 modified file

---

## Notes

- No new source files in `src/` or `tests/` — all deliverables are at the repo root
- `node_modules` must never be volume-mounted (platform-specific `workerd` binary — see `research.md`)
- After any `package.json` change, run `docker compose build` to reinstall the correct Linux binaries
- `docker compose up` and `npm run dev` remain independently usable — Docker is optional
