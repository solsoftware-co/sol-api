# Sol API

Client data service for Sol Software. Exposes the `clients` table from the shared Neon
database behind a versioned REST API, so consuming services (notification service, future
MCP agents) don't hold direct database connections.

**Stack**: Hono 4.x → Cloudflare Workers (V8 isolate) → Neon PostgreSQL

---

## Prerequisites

- Node.js 20+
- Wrangler CLI (`npm install -g wrangler`)
- Access to the Neon dev branch connection string

---

## Local Setup

```bash
git clone <repo> sol-api
cd sol-api
npm install
```

Copy the example secrets file and fill in your values:

```bash
cp .dev.vars.example .dev.vars
```

Then edit `.dev.vars` with your Neon dev branch connection string and a local API key.
This file is gitignored and never committed.

---

## Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start local Wrangler dev server on `http://localhost:8787` |
| `npm test` | Run all tests via Vitest (CF Workers runtime) |
| `npm run test:watch` | Run tests in watch mode |
| `npm run type-check` | TypeScript type check without emitting |
| `npm run deploy` | Deploy to Cloudflare Workers (production) |

---

## Endpoints

All endpoints except `/health` require `X-API-Key: <key>` header.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Service + database status (no auth) |
| GET | `/v1/clients` | List active clients (supports `?limit=N`) |
| GET | `/v1/clients/:id` | Fetch single client by ID (includes `google_service_account_key`) |
| POST | `/v1/clients` | Create a new client |
| PATCH | `/v1/clients/:id` | Partially update a client |

All responses use the envelope:
```json
{ "success": true, "data": { ... } }
{ "success": false, "error": { "code": "NOT_FOUND", "message": "..." } }
```

---

## Deployment

```bash
# Set secrets once per environment
wrangler secret put DATABASE_URL
wrangler secret put API_KEY

# Deploy
npm run deploy

# Deploy to preview
npm run deploy -- --env preview
```

### Environments

| Environment | Worker | Neon branch | Deployed by | Purpose |
|-------------|--------|-------------|-------------|---------|
| PR preview | `sol-api-pr-<n>` | `pr-<n>` (from `staging`) | `pr.yml` on each PR push | This repo's own PR checks; torn down on close |
| Dev | `sol-api-dev` | `dev` (from `staging`) | `release.yml` on every merge to `main` | Shared target for **other repos'** pre-merge PR environments (sol-notify, integration-service). Expect test data and noise. |
| Staging | `sol-api-staging` | `staging` | `release.yml` on every merge to `main` | sol-api's own post-merge, pre-prod verification. Keep it clean — don't point other repos here. |
| Production | `sol-api` | production | `release.yml`, after manual approval | Live |

Dev secrets live in GitHub as `DATABASE_URL_DEV` and `API_KEY_DEV`. A failed dev deploy never blocks production.

The `dev` Neon branch is also the one local `.dev.vars` points at, so local work and the deployed `sol-api-dev` share data. `npm run db:branch:reset` resets that shared branch back to its parent, wiping any data other repos' PR environments are relying on. Give a heads-up before running it.

---

## Specs

Full design documentation lives in `specs/001-hono-client-api/`:

- `spec.md` — functional requirements and acceptance scenarios
- `plan.md` — implementation phases and project structure
- `contracts/api.md` — full endpoint contracts with request/response shapes
- `data-model.md` — DB schema and TypeScript interfaces
- `research.md` — platform and tooling decisions
