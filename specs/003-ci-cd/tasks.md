# Tasks: CI/CD Pipeline

**Input**: Design documents from `specs/003-ci-cd/`  
**Branch**: `feat/003-ci-cd`

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on each other)
- **[Story]**: Maps to user story from spec.md (US1, US2, US3)

---

## Phase 1: Setup

**Purpose**: Install new dependencies before any workflow references them

- [x] T001 Update `package.json` — add `semantic-release`, `@semantic-release/commit-analyzer`, `@semantic-release/release-notes-generator`, `@semantic-release/changelog`, `@semantic-release/git`, `@semantic-release/github` to `devDependencies`; run `npm install` to update `package-lock.json`

---

## Phase 2: Foundational (Blocking Prerequisite)

**Purpose**: GitHub Secrets and branch protection must be in place before any workflow can authenticate with Cloudflare or block PR merges

**⚠️ CRITICAL**: No user story can be verified until this is complete

- [ ] T002 Configure all GitHub Secrets and enable branch protection on `main` per `specs/003-ci-cd/quickstart.md` — secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `WORKERS_SUBDOMAIN`, `DATABASE_URL`, `DATABASE_URL_PREVIEW`, `DATABASE_URL_PRODUCTION`, `API_KEY`, `API_KEY_PREVIEW`, `API_KEY_PRODUCTION`; branch protection: require `test` status check on `main`

**Checkpoint**: Secrets configured, branch protection active — workflow implementations can now proceed

---

## Phase 3: User Story 1 — Automated Tests on Pull Request (Priority: P1) 🎯 MVP

**Goal**: Every PR triggers the test suite automatically; merge is blocked on failure

**Independent Test**: Open a PR with a deliberate failing test → confirm `test` check fails and merge is blocked; fix the test → confirm `test` check passes and merge is unblocked

### Implementation for User Story 1

- [x] T003 [US1] Update `.github/workflows/ci.yml` — remove `push: branches: [main]` trigger (production deploy moves to `release.yml`); add `API_KEY: ${{ secrets.API_KEY }}` to test step env; change test command to `npm test -- --bail --reporter=verbose --reporter=json --outputFile=test-results.json`; add a follow-up step with `if: always()` that uses `actions/github-script` to read `test-results.json` and post (or update) a markdown PR comment showing total/passed/failed/skipped counts with a per-suite failure breakdown in a `<details>` block

- [ ] T004 [US1] Verify US1: open a test PR, confirm the `test` status check appears within 5 minutes and reports pass/fail correctly on the PR (depends on T002, T003)

**Checkpoint**: US1 complete — test gate is live on every PR

---

## Phase 4: User Story 2 — Preview Environment on Pull Request (Priority: P2)

**Goal**: Every PR gets a live preview URL posted as a comment; preview is torn down on PR close

**Independent Test**: Open a test PR → confirm a preview URL comment appears within 5 minutes → hit `{PREVIEW_URL}/health` and confirm `200` response → close the PR → confirm the preview worker is deleted from Cloudflare dashboard

### Implementation for User Story 2

- [x] T005 [P] [US2] Create `.github/workflows/preview.yml` — trigger: `pull_request [opened, synchronize, reopened]`; steps: `npm ci`, deploy via `cloudflare/wrangler-action@v3` with `--env preview --name sol-api-pr-${{ github.event.pull_request.number }}`, set `PREVIEW_URL` in `$GITHUB_ENV`, wait 30 seconds, run `npx vitest run tests/e2e/smoke.test.ts` with `PREVIEW_URL` and `API_KEY_PREVIEW` in env, post preview URL comment via `actions/github-script`

- [x] T006 [P] [US2] Create `.github/workflows/cleanup.yml` — trigger: `pull_request [closed]`; steps: call `DELETE https://api.cloudflare.com/client/v4/accounts/${{ secrets.CLOUDFLARE_ACCOUNT_ID }}/workers/services/sol-api-pr-${{ github.event.pull_request.number }}` with `Authorization: Bearer ${{ secrets.CLOUDFLARE_API_TOKEN }}`; treat 404 as success (idempotent)

- [x] T007 [P] [US2] Create `tests/e2e/smoke.test.ts` — skip all tests if `PREVIEW_URL` env var is not set (safe to run locally); test 1: `GET {PREVIEW_URL}/health` returns `200` with `{ success: true, data: { status: "ok" } }`; test 2: `GET {PREVIEW_URL}/v1/clients` without `X-API-Key` returns `401`; test 3: `GET {PREVIEW_URL}/v1/clients` with valid `API_KEY_PREVIEW` returns `200`

- [ ] T008 [US2] Verify US2: open a test PR, confirm preview URL is posted as a comment, hit the preview URL and confirm it responds, close the PR, confirm the worker is removed from Cloudflare (depends on T002, T005, T006, T007)

**Checkpoint**: US2 complete — every PR has a live, independently testable preview environment

---

## Phase 5: User Story 3 — Production Deploy + Semantic Release (Priority: P3)

**Goal**: Merge to `main` automatically deploys to production and cuts a versioned GitHub Release when `feat:` or `fix:` commits are present

**Independent Test**: Merge a PR containing a `feat: add test route` commit → confirm production worker is updated on Cloudflare → confirm a GitHub Release is created with the correct version bump → confirm `CHANGELOG.md` and `package.json` version are updated in a follow-up commit on `main`

### Implementation for User Story 3

- [x] T009 [P] [US3] Create `.releaserc.json` at repo root — `branches: ["main"]`; plugins: `commit-analyzer`, `release-notes-generator`, `["changelog", { "changelogFile": "CHANGELOG.md" }]`, `["git", { "assets": ["package.json", "CHANGELOG.md"], "message": "chore(release): ${nextRelease.version} [skip ci]\n\n${nextRelease.notes}" }]`, `github`; do NOT include `@semantic-release/npm` (not published to npm)

- [x] T010 [P] [US3] Create `.github/workflows/release.yml` — trigger: `push: branches: [main]`; permissions: `contents: write`, `issues: write`, `pull-requests: write`; steps: `actions/checkout@v4` with `fetch-depth: 0` (required for commit history analysis), `actions/setup-node@v4` node 20, `npm ci`, `npm test -- --bail` with `DATABASE_URL` and `API_KEY` secrets, deploy via `cloudflare/wrangler-action@v3` (no `--env` flag — production), `npx semantic-release` with `GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}`

- [ ] T011 [US3] Verify US3: merge a PR with a `feat:` commit message, confirm production API is updated within 5 minutes, confirm a GitHub Release is created, confirm `CHANGELOG.md` is updated and `package.json` version is bumped in a `chore(release):` commit on `main` (depends on T002, T009, T010)

**Checkpoint**: US3 complete — all three user stories are independently functional

---

## Phase 6: Polish & Cross-Cutting Concerns

- [ ] T012 [P] Verify `chore:` and `ci:` commits do NOT produce a GitHub Release (confirms semantic-release rules are correctly configured)
- [ ] T013 [P] Confirm `npm test` still runs cleanly locally with no changes to the local dev workflow (Docker and `wrangler dev` unaffected)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 (secrets reference the devDeps installed in T001 indirectly via npm ci)
- **US1 (Phase 3)**: Depends on T002 (branch protection must be active to block merges)
- **US2 (Phase 4)**: Depends on T002 (Cloudflare secrets must be set); T005, T006, T007 can run in parallel with each other
- **US3 (Phase 5)**: Depends on T002 (Cloudflare + GitHub secrets); T009 and T010 can run in parallel with each other
- **Polish (Phase 6)**: Depends on all three US verifications passing

### User Story Dependencies

- **US1 (P1)**: Requires T002. Modifies one existing file. Delivers the test gate.
- **US2 (P2)**: Requires T002. Three new files, all parallelizable. Delivers preview environments.
- **US3 (P3)**: Requires T002 + T001 (semantic-release deps). Two new files, both parallelizable. Delivers CD + releases.

### Parallel Opportunities

- **T005, T006, T007** (all US2 implementation): three different files, no inter-dependencies
- **T009, T010** (all US3 implementation): two different files, no inter-dependencies
- **T012, T013** (polish): independent verifications

---

## Parallel Example: User Story 2

```bash
# T005, T006, T007 can all be created simultaneously:
Task: "Create .github/workflows/preview.yml"
Task: "Create .github/workflows/cleanup.yml"
Task: "Create tests/e2e/smoke.test.ts"

# Then T008 (verify) after all three are in place
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: T001
2. Complete Phase 2: T002
3. Complete Phase 3: T003 → T004 (verify)
4. **STOP and VALIDATE**: every PR now has a test gate
5. Ship — developers get merge protection immediately

### Incremental Delivery

1. T001 + T002 → prerequisites ready
2. T003 + T004 → US1 complete (test gate live)
3. T005 + T006 + T007 (parallel) → T008 → US2 complete (preview environments live)
4. T009 + T010 (parallel) → T011 → US3 complete (CD + releases live)
5. T012 + T013 → polish

**Total**: 13 tasks, 4 new files, 1 modified file, 1 new config file

---

## Notes

- No changes to `src/` — all deliverables are workflow, config, and test files
- `tests/e2e/smoke.test.ts` uses `skipIf(!process.env.PREVIEW_URL)` — safe to run locally without side effects
- The `[skip ci]` flag in the semantic-release commit message prevents the release workflow from triggering on its own version bump commit
- After any `package.json` devDependency change, `npm ci` in CI automatically picks up the updated `package-lock.json`
