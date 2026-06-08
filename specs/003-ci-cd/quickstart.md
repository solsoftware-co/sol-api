# Quickstart: CI/CD Pipeline Setup

This is a one-time setup guide. Once complete, the pipeline runs automatically with no further configuration.

---

## Prerequisites

- Cloudflare account with at least one Worker deployed (the existing `sol-api`)
- GitHub repository admin access (to add secrets and branch protection)
- Three Neon branches: one for tests, one for preview, one for production

---

## Step 1: Create a Cloudflare API Token

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com) → My Profile → API Tokens
2. Click **Create Token** → Use the **"Edit Cloudflare Workers"** template
3. Scope to your account and the `sol-api` service
4. Copy the token — you won't see it again

---

## Step 2: Find Your Cloudflare Account ID and Workers Subdomain

**Account ID**: Cloudflare Dashboard → Workers & Pages → Overview → right sidebar shows "Account ID"

**Workers subdomain**: Cloudflare Dashboard → Workers & Pages → Overview → your subdomain is shown as `{subdomain}.workers.dev`

---

## Step 3: Add GitHub Secrets

Go to your repository → Settings → Secrets and variables → Actions → New repository secret. Add all of the following:

| Secret name | Value |
|-------------|-------|
| `CLOUDFLARE_API_TOKEN` | Token from Step 1 |
| `CLOUDFLARE_ACCOUNT_ID` | Account ID from Step 2 |
| `WORKERS_SUBDOMAIN` | Your subdomain from Step 2 (e.g. `acme`, not `acme.workers.dev`) |
| `DATABASE_URL` | Neon connection string for the **test** branch |
| `DATABASE_URL_STAGING` | Neon connection string for the **preview** branch |
| `DATABASE_URL_PRODUCTION` | Neon connection string for the **production** branch |
| `API_KEY` | API key for the test environment |
| `API_KEY_STAGING` | API key for the preview environment |
| `API_KEY_PRODUCTION` | API key for the production environment |

---

## Step 4: Enable Branch Protection on `main`

1. Go to Settings → Branches → Add branch protection rule
2. Branch name pattern: `main`
3. Enable: **Require status checks to pass before merging**
4. Add required checks: `test` (from `ci.yml`)
5. Enable: **Require branches to be up to date before merging**
6. Save

---

## Step 5: Verify

1. Open any pull request against `main`
2. Within 2 minutes you should see:
   - ✅ `test` check running in the PR status area
   - ✅ `preview` check running
   - A comment on the PR with the preview URL once deploy completes
3. Merge the PR and confirm:
   - Production deploys (check Cloudflare Workers dashboard)
   - A GitHub Release is created if the commit contained `feat:` or `fix:`

---

## Troubleshooting

**Tests fail in CI but pass locally**  
Check that `DATABASE_URL` and `API_KEY` secrets are set. The test job passes both to the test runner.

**Preview deployment fails with auth error**  
Verify `CLOUDFLARE_API_TOKEN` has "Edit Workers" permission and is scoped to the correct account.

**No GitHub Release created after merge**  
Semantic release only creates a release when commits contain `feat:` or `fix:`. A `chore:` or `ci:` merge will deploy but not cut a release — this is expected.

**Preview worker not deleted after PR close**  
If the cleanup job failed, delete manually: Cloudflare Dashboard → Workers & Pages → find `sol-api-pr-{NUMBER}` → Delete.

**E2E tests fail with connection refused**  
The 30-second cold start window may not be enough. Check the `preview.yml` workflow log — if the Worker wasn't ready, increase the wait step.
