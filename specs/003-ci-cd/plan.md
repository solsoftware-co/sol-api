# Implementation Plan: CI/CD Pipeline

**Branch**: `feat/003-ci-cd` | **Date**: 2026-06-07 | **Spec**: [spec.md](spec.md)  
**Input**: Feature specification from `specs/003-ci-cd/spec.md`

## Summary

Add a complete CI/CD pipeline using GitHub Actions: automated tests on every PR, per-PR preview deployments to Cloudflare Workers, production deployment on merge to main, and semantic-release for automated versioning and changelogs. The existing `ci.yml` (test runner) is enhanced and three new workflows are added.

## Technical Context

**Language/Version**: TypeScript 5.x / Node 20  
**Primary Dependencies**: Wrangler 3.x, `cloudflare/wrangler-action@v3`, `semantic-release` ^24.x  
**Storage**: N/A (no new data storage; Neon credentials passed per-environment via GitHub Secrets)  
**Testing**: Vitest + `@cloudflare/vitest-pool-workers` (existing); new `tests/e2e/` for smoke tests  
**Target Platform**: GitHub Actions (ubuntu-latest runners)  
**Project Type**: CI/CD configuration — no changes to `src/`  
**Performance Goals**: Test phase ≤ 5 min; preview deploy ≤ 5 min; production deploy ≤ 5 min (per SC-001–SC-003)  
**Constraints**: Must stay within GitHub Actions free tier (standard runners); Cloudflare Workers free tier per preview worker  
**Scale/Scope**: One production worker, one preview worker per open PR, automated releases on every `main` merge

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. REST-First Design | ✅ Pass | No changes to routes or response shapes |
| II. Multi-Environment Safety | ✅ Pass | Separate `DATABASE_URL` and `API_KEY` per environment enforced via GitHub Secrets; preview uses `[env.preview]` |
| III. Sensitive Data Protection | ✅ Pass | All secrets stored in GitHub Secrets and Cloudflare Secrets; never in source files |
| IV. Response Shape & Observability | ✅ Pass | E2E smoke tests validate `/health` response shape post-deploy |
| V. AI-Agent Friendly Codebase | ✅ Pass | Spec exists before implementation; no pattern changes to `src/` |
| VI. Minimal Infrastructure & DX | ✅ Pass | `wrangler dev` continues to work standalone; GitHub Actions already in free-tier allowances; `semantic-release` is devDep (MINOR amendment needed — see Complexity Tracking) |

**Post-design re-check**: No violations introduced by the workflow designs below.

## Project Structure

### Documentation (this feature)

```text
specs/003-ci-cd/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── contracts/
│   └── workflows.md     # Phase 1 output — workflow trigger/output contracts
├── quickstart.md        # Phase 1 output — GitHub Secrets setup guide
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code (repository root)

```text
.github/
└── workflows/
    ├── ci.yml           # MODIFIED — test gate on PR + push to main (already exists)
    ├── preview.yml      # NEW — deploy preview + run E2E on PR open/sync
    ├── cleanup.yml      # NEW — delete preview worker on PR close
    └── release.yml      # NEW — deploy production + semantic-release on merge to main

tests/
└── e2e/
    └── smoke.test.ts    # NEW — HTTP smoke tests against live preview URL

.releaserc.json          # NEW — semantic-release configuration
```

**Structure Decision**: All deliverables are configuration and test files. No changes to `src/`, `wrangler.toml`, or `package.json` scripts (only new devDependencies added).

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| MINOR amendment: add `semantic-release` to Technology Stack | Automated versioning and GitHub Releases required by user; conventional commits already in place | `release-please` requires a manual "release PR" merge step, defeating the goal of zero-touch automation |

---

## Phase 1: Test Gate (Enhance Existing CI)

**Goal**: Every PR is blocked from merging if tests fail. Existing `ci.yml` already runs `npm test` but lacks branch protection enforcement and verbosity.

**Changes to `ci.yml`**:
- Scope to `pull_request` only (production deploy moves to `release.yml`)
- Add `--bail --reporter=verbose --reporter=json --outputFile=test-results.json` flags
- Add `API_KEY` secret (needed by integration tests that hit authenticated routes)
- Add a post-test step (runs on `always()` — fires even on failure) that reads `test-results.json` and posts a formatted markdown comment to the PR via `actions/github-script`; updates the existing comment on re-runs rather than creating a new one

**PR comment format**:
```
## Test Results ✅  (or ❌ on failure)
| Total | Passed | Failed | Skipped |
|-------|--------|--------|---------|
| 42    | 42     | 0      | 0       |

<details> with per-suite breakdown on failure
```

**Branch protection** (one-time manual setup — documented in `quickstart.md`):
- Require status check `test` before merge on `main`

**Checkpoint**: PR opened → tests run → summary comment posted on PR → merge blocked on failure

---

## Phase 2: Preview Deployment

**Goal**: Every PR gets a live preview worker at a unique URL, posted as a PR comment.

**New `preview.yml`** triggers on `pull_request: [opened, synchronize, reopened]`:

1. Run `npm ci`
2. Deploy via `cloudflare/wrangler-action@v3` with `--env preview --name sol-api-pr-{PR_NUMBER}`
3. Post preview URL as a PR comment via `actions/github-script`

**Preview URL pattern**: `https://sol-api-pr-{PR_NUMBER}.{WORKERS_SUBDOMAIN}.workers.dev`

**New `cleanup.yml`** triggers on `pull_request: [closed]`:

1. Call Cloudflare REST API to `DELETE /accounts/{ACCOUNT_ID}/workers/services/sol-api-pr-{PR_NUMBER}`

**Secrets required** (in addition to existing `DATABASE_URL`):
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `DATABASE_URL_PREVIEW` (separate Neon branch per Principle II)
- `API_KEY_PREVIEW`
- `WORKERS_SUBDOMAIN` (account's `.workers.dev` subdomain)

**Checkpoint**: PR opened → preview deployed → URL commented on PR → PR closed → preview torn down

---

## Phase 3: E2E Smoke Tests

**Goal**: After preview deployment, real HTTP requests validate the deployed worker before the PR is marked ready.

**New `tests/e2e/smoke.test.ts`**:
- Reads `PREVIEW_URL` from env; skips entirely if not set (safe to run locally without side effects)
- Tests: `GET /health` returns `200` with correct envelope; `GET /v1/clients` without key returns `401`
- Uses `fetch` directly — no test client wrappers needed

**Integration with `preview.yml`**:
- After deploy step, set `PREVIEW_URL` in `$GITHUB_ENV`
- Add 30-second wait (Worker cold start)
- Run `npx vitest run tests/e2e/smoke.test.ts` with `PREVIEW_URL` and `API_KEY_PREVIEW` in env

**Checkpoint**: E2E smoke tests pass against live preview URL before PR is mergeable

---

## Phase 4: Production Deployment

**Goal**: Merge to `main` automatically deploys to production with zero manual steps.

**New `release.yml`** triggers on `push: branches: [main]`:

1. Run `npm ci`
2. Run `npm test` (full suite as final gate before deploy)
3. Deploy via `cloudflare/wrangler-action@v3` (no `--env` flag → uses production config from `wrangler.toml`)
4. Run `npx semantic-release` (see Phase 5)

**Secrets required**:
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `DATABASE_URL_PRODUCTION`
- `API_KEY_PRODUCTION`
- `GITHUB_TOKEN` (built-in, no setup needed)

**Checkpoint**: Merge to `main` → tests pass → production deployed → release cut

---

## Phase 5: Semantic Release

**Goal**: Every merge to `main` that contains a `feat:` or `fix:` commit automatically bumps the version, updates `CHANGELOG.md`, and creates a GitHub Release.

**New `.releaserc.json`** at repo root:
```json
{
  "branches": ["main"],
  "plugins": [
    "@semantic-release/commit-analyzer",
    "@semantic-release/release-notes-generator",
    ["@semantic-release/changelog", { "changelogFile": "CHANGELOG.md" }],
    ["@semantic-release/git", {
      "assets": ["package.json", "CHANGELOG.md"],
      "message": "chore(release): ${nextRelease.version} [skip ci]\n\n${nextRelease.notes}"
    }],
    "@semantic-release/github"
  ]
}
```

**New devDependencies** (added to `package.json`):
```
semantic-release
@semantic-release/commit-analyzer
@semantic-release/release-notes-generator
@semantic-release/changelog
@semantic-release/git
@semantic-release/github
```

**Version bump rules** (from conventional commits):
- `fix:` → patch (0.0.x)
- `feat:` → minor (0.x.0)
- `BREAKING CHANGE:` footer → major (x.0.0)
- `chore:`, `docs:`, `ci:`, `refactor:` → no release

**Checkpoint**: Merge with `feat:` commit → GitHub Release created → CHANGELOG updated → `package.json` version bumped → commit pushed back to `main` with `[skip ci]`

---

## Phase 6: Verification

- [ ] Open a test PR → confirm tests run, preview URL is posted, E2E passes
- [ ] Merge the test PR → confirm production deploys, GitHub Release is created
- [ ] Close a stale test PR → confirm preview worker is torn down
- [ ] Confirm `chore:` commit produces no release; `feat:` commit produces minor bump
