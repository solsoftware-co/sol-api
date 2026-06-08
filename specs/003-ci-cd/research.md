# Research: CI/CD Pipeline

**Feature**: `feat/003-ci-cd`  
**Date**: 2026-06-07

## Decision Log

---

### 1. CI Platform

**Decision**: GitHub Actions (already in use)  
**Rationale**: Already referenced in the constitution's free-tier allowances ("GitHub Actions standard runners"). The existing `ci.yml` confirms it's the chosen platform. No evaluation of alternatives needed.  
**Alternatives considered**: CircleCI, Buildkite — no justification to switch; GitHub Actions is free for public/private repos at standard scale.

---

### 2. Wrangler Deployment Action

**Decision**: `cloudflare/wrangler-action@v3` (Cloudflare-official)  
**Rationale**: First-party action, actively maintained, auto-detects the Wrangler version from `package.json`. Abstracts credential injection cleanly. Raw `npx wrangler` is viable but requires more manual env plumbing.  
**Secrets required**:
- `CLOUDFLARE_API_TOKEN` — create in Cloudflare dashboard → My Profile → API Tokens → "Edit Cloudflare Workers" template (least privilege)
- `CLOUDFLARE_ACCOUNT_ID` — found in Cloudflare dashboard → Workers & Pages overview
- `DATABASE_URL` — Neon connection string (per environment — preview and production must differ; see Principle II)
- `API_KEY` — runtime API key (per environment)

---

### 3. Per-PR Preview Deployment Strategy

**Decision**: CLI `--name sol-api-pr-{PR_NUMBER}` runtime override; `[env.preview]` in wrangler.toml provides environment settings  
**Rationale**: Wrangler 3.x supports overriding the worker name at deploy time via `--name`. This keeps wrangler.toml clean (no per-PR config) while still inheriting the `[env.preview]` settings (ENVIRONMENT binding, etc.). Each PR gets an isolated worker: `sol-api-pr-123`, `sol-api-pr-124`, etc.  
**Preview URL pattern**: `https://sol-api-pr-{PR_NUMBER}.{ACCOUNT_SUBDOMAIN}.workers.dev`  
**Teardown**: Wrangler has no native delete command. Use the Cloudflare REST API (`DELETE /accounts/{ACCOUNT_ID}/workers/services/{WORKER_NAME}`) triggered on `pull_request: [closed]` event.  
**Alternatives considered**: Cloudflare Pages — not applicable (this is a Worker, not a static site). Reusing a single preview environment — rejected because concurrent PRs would overwrite each other.

---

### 4. Release Automation

**Decision**: `semantic-release`  
**Rationale**: The user explicitly wants "semantic releases", which maps directly to the `semantic-release` package and its conventional-commit → semver pipeline. The project already uses conventional commits. `semantic-release` runs on merge to `main`, analyzes commits, bumps `package.json` version, generates CHANGELOG, and creates a GitHub Release — all without manual intervention.  
**Why not `release-please`**: `release-please` creates an intermediate "release PR" that must be merged manually. This adds a step; `semantic-release` is fully automated and a better fit for a CI/CD pipeline that should require zero human action post-merge.  
**Plugins needed** (non-npm project — no npm publish):
- `@semantic-release/commit-analyzer` — determines version bump from commits
- `@semantic-release/release-notes-generator` — generates release notes
- `@semantic-release/changelog` — writes `CHANGELOG.md`
- `@semantic-release/git` — commits version bump and CHANGELOG back to `main`
- `@semantic-release/github` — creates the GitHub Release
- `@semantic-release/npm` is explicitly NOT included (not published to npm)

---

### 5. E2E Testing Strategy

**Decision**: Vitest with `PREVIEW_URL` env var in a new `tests/e2e/` directory, plus a shell retry-loop to handle Worker cold start before tests run  
**Rationale**: Reuses the existing Vitest toolchain — no new test runner. Tests are real HTTP requests against the live preview URL (not against Miniflare), so they validate the actual deployed environment. A 30-second cold-start window is needed after deploy before the Worker reliably responds.  
**Scope**: Smoke tests only — health check, auth rejection, and one authenticated request. Full integration coverage remains in `tests/integration/` via Vitest + Workers pool.  
**Alternatives considered**: Shell `curl` assertions — simpler but no structured reporting. Playwright/supertest — unnecessary overhead for a JSON API.

---

### 6. Vitest in CI

**Decision**: No special configuration needed beyond what exists  
**Rationale**: `CI=true` is set automatically by GitHub Actions and detected by Vitest (disables interactive mode). The existing `vitest.config.ts` with `@cloudflare/vitest-pool-workers` runs correctly on Node 20 in GitHub Actions. `DATABASE_URL` is already passed as a secret in the current `ci.yml`.  
**Recommended flags**: `--bail` (stop on first failure for faster feedback) and `--reporter=verbose` (clearer output). These are additive only.

---

### 7. Constitution Compliance

**New tooling to add to the approved stack** (MINOR amendment required per Principle VI):

| Layer | Technology | Approved Version |
|-------|------------|-----------------|
| CI/CD | GitHub Actions | standard runners |
| Release | semantic-release | ^24.x (devDep) |

GitHub Actions is already implicitly approved (constitution references "GitHub Actions standard runners"). `semantic-release` is a devDependency release tool, not runtime infrastructure — treated as a MINOR amendment.

**No Principle violations**: No new runtime infrastructure, no new hosting platforms, no secrets in source files, `wrangler dev` continues to work standalone.
