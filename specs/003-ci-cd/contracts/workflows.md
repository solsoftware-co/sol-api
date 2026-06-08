# Workflow Contracts: CI/CD Pipeline

## Overview

Four GitHub Actions workflows deliver the pipeline. Each is independently triggerable and has a defined set of inputs (triggers + secrets) and outputs (status checks, comments, deployments).

---

## Workflow 1: `ci.yml` — Test Gate

**Trigger**: `pull_request` (opened, synchronize, reopened)

**Inputs**:
| Input | Source | Required |
|-------|--------|----------|
| `DATABASE_URL` | GitHub Secret | Yes |
| `API_KEY` | GitHub Secret | Yes |

**Steps**: `npm ci` → `npm test --bail --reporter=verbose`

**Outputs**:
| Output | Description |
|--------|-------------|
| Status check: `test` | Pass/fail — blocks PR merge when failing (branch protection required) |
| PR comment: test summary | Posted (or updated) on every run, even on failure — shows total/passed/failed/skipped counts; failed runs include a per-suite breakdown in a collapsible `<details>` block |

**Failure behaviour**: Job fails immediately on first test failure (`--bail`). The summary comment step runs regardless (`if: always()`) so a failure report is always posted to the PR. Full error output also visible in the Actions log.

---

## Workflow 2: `preview.yml` — Preview Deployment

**Trigger**: `pull_request` (opened, synchronize, reopened)

**Inputs**:
| Input | Source | Required |
|-------|--------|----------|
| `CLOUDFLARE_API_TOKEN` | GitHub Secret | Yes |
| `CLOUDFLARE_ACCOUNT_ID` | GitHub Secret | Yes |
| `DATABASE_URL_STAGING` | GitHub Secret | Yes |
| `API_KEY_STAGING` | GitHub Secret | Yes |
| `WORKERS_SUBDOMAIN` | GitHub Secret | Yes |

**Steps**:
1. `npm ci`
2. Deploy: `wrangler deploy --env preview --name sol-api-pr-{PR_NUMBER}`
3. Set `PREVIEW_URL=https://sol-api-pr-{PR_NUMBER}.{WORKERS_SUBDOMAIN}.workers.dev`
4. Wait 30 seconds (Worker cold start)
5. Run E2E: `vitest run tests/e2e/smoke.test.ts` with `PREVIEW_URL` + `API_KEY_STAGING`
6. Post PR comment with preview URL

**Outputs**:
| Output | Description |
|--------|-------------|
| Status check: `preview` | Pass/fail for deploy + E2E |
| PR comment | Preview URL posted to the pull request |
| Deployed worker | `sol-api-pr-{PR_NUMBER}` on Cloudflare Workers |

**Preview URL format**: `https://sol-api-pr-{PR_NUMBER}.{WORKERS_SUBDOMAIN}.workers.dev`

**Failure behaviour**: If deploy fails, E2E step is skipped. PR comment is still posted indicating failure. Status check fails.

---

## Workflow 3: `cleanup.yml` — Preview Teardown

**Trigger**: `pull_request` (closed) — fires on both merge and manual close

**Inputs**:
| Input | Source | Required |
|-------|--------|----------|
| `CLOUDFLARE_API_TOKEN` | GitHub Secret | Yes |
| `CLOUDFLARE_ACCOUNT_ID` | GitHub Secret | Yes |

**Steps**:
1. Call `DELETE https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}/workers/services/sol-api-pr-{PR_NUMBER}`

**Outputs**:
| Output | Description |
|--------|-------------|
| Deleted worker | `sol-api-pr-{PR_NUMBER}` removed from Cloudflare |

**Failure behaviour**: Non-blocking — if the worker was never deployed (e.g., preview job failed) the DELETE returns 404 which is treated as success (idempotent).

---

## Workflow 4: `release.yml` — Production Deploy + Semantic Release

**Trigger**: `push` to `main`

**Inputs**:
| Input | Source | Required |
|-------|--------|----------|
| `CLOUDFLARE_API_TOKEN` | GitHub Secret | Yes |
| `CLOUDFLARE_ACCOUNT_ID` | GitHub Secret | Yes |
| `DATABASE_URL_PRODUCTION` | GitHub Secret | Yes |
| `API_KEY_PRODUCTION` | GitHub Secret | Yes |
| `GITHUB_TOKEN` | Built-in (no setup) | Yes |

**Permissions required** (set on job):
```yaml
permissions:
  contents: write   # push version bump commit + create release
  issues: write     # semantic-release GitHub plugin
  pull-requests: write
```

**Steps**:
1. `actions/checkout@v4` with `fetch-depth: 0` (full history for commit analysis)
2. `npm ci`
3. `npm test` (final gate before deploy)
4. Deploy via `cloudflare/wrangler-action@v3` (production — no `--env` flag)
5. `npx semantic-release`

**Outputs**:
| Output | Description |
|--------|-------------|
| Deployed production worker | `sol-api` on Cloudflare Workers |
| GitHub Release | Created when `feat:` or `fix:` commits present |
| `CHANGELOG.md` commit | Updated and pushed back to `main` with `[skip ci]` |
| `package.json` version | Bumped and committed back to `main` |

**Failure behaviour**: If tests fail, deploy and release steps do not run. If deploy fails, semantic-release does not run (production stays on previous version). Failures are reported on the commit status.

---

## GitHub Secrets Reference

| Secret | Used By | Description |
|--------|---------|-------------|
| `DATABASE_URL` | `ci.yml` | Neon connection string (test environment) |
| `DATABASE_URL_STAGING` | `preview.yml` | Neon connection string (preview Neon branch) |
| `DATABASE_URL_PRODUCTION` | `release.yml` | Neon connection string (production Neon branch) |
| `API_KEY` | `ci.yml` | API key for integration test authentication |
| `API_KEY_STAGING` | `preview.yml` | API key for preview environment |
| `API_KEY_PRODUCTION` | `release.yml` | API key for production environment |
| `CLOUDFLARE_API_TOKEN` | `preview.yml`, `cleanup.yml`, `release.yml` | Cloudflare API token (Edit Workers permission) |
| `CLOUDFLARE_ACCOUNT_ID` | `preview.yml`, `cleanup.yml`, `release.yml` | Cloudflare account ID |
| `WORKERS_SUBDOMAIN` | `preview.yml` | Your `.workers.dev` subdomain (e.g. `acme`) |

---

## Semantic Release Version Bump Rules

| Commit type | Version bump | Example |
|-------------|-------------|---------|
| `fix:` | Patch (0.0.x) | `fix: correct 401 on missing key` |
| `feat:` | Minor (0.x.0) | `feat: add preview deployments` |
| `BREAKING CHANGE:` (footer) | Major (x.0.0) | `feat!: change response envelope` |
| `chore:`, `ci:`, `docs:`, `refactor:`, `test:` | No release | `chore: update deps` |
