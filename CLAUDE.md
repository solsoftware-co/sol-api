# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Status

This repository is in active implementation. The spec, plan, and architectural decisions are fully documented in `specs/001-hono-client-api/`. Source code does not exist yet — implementation follows the plan in `specs/001-hono-client-api/plan.md`.

## Commands

```bash
npm run dev      # wrangler dev server on http://localhost:8787
npm test         # vitest via @cloudflare/vitest-pool-workers
npm run deploy   # deploy to Cloudflare Workers

# Run a single test file
npx vitest run tests/integration/clients.test.ts
```

Local secrets go in `.dev.vars` (gitignored):
```
DATABASE_URL=postgres://...
API_KEY=dev-local-key
ENVIRONMENT=development
```

One-time secret setup for Cloudflare:
```bash
wrangler secret put DATABASE_URL
wrangler secret put API_KEY
```

## Architecture

**Stack**: Hono 4.x → Cloudflare Workers (V8 isolate) → Neon PostgreSQL (existing `clients` table from `sol-notification-service`)

This API centralizes client data access so consuming services (notification service, future MCP agents) don't hold direct database connections. It exposes client-management endpoints and notification-log tracking endpoints behind a shared API key.

### Source layout

```
src/
├── index.ts                    # Hono app entry + CF Worker fetch export
├── routes/
│   ├── health.ts                # GET /health (no auth)
│   ├── clients.ts               # GET /v1/clients, GET /v1/clients/:id, POST, PATCH
│   └── notification-logs.ts     # GET /v1/notification-logs, GET /v1/notification-logs/:id, POST
├── middleware/
│   ├── auth.ts                  # X-API-Key enforcement via HTTPException
│   └── error.ts                 # Global handler → envelope shape
├── lib/
│   ├── db.ts                    # neon() factory (fetch transport, no ws)
│   └── schema.ts                # Drizzle table definitions (clients, notification_logs)
├── types/index.ts               # Env bindings, ErrorCode enum, ApiResponse<T>
└── validators/
    ├── client.ts                 # Zod schemas for create + update payloads
    └── notification-log.ts       # Zod schema for create payload
```

### Neon connection pattern

CF Workers cannot hold persistent WebSocket connections, so `@neondatabase/serverless` is used with its HTTP fetch transport — no Pool, no `ws` polyfill:

```typescript
import { neon } from "@neondatabase/serverless";
const sql = neon(c.env.DATABASE_URL);
const rows = await sql`SELECT * FROM clients WHERE active = TRUE`;
```

### Response envelope

Every response — success or error — uses this shape:

```json
{ "success": true, "data": { ... } }
{ "success": false, "error": { "code": "NOT_FOUND", "message": "...", "details": null } }
```

Error codes: `UNAUTHORIZED`, `NOT_FOUND`, `VALIDATION_ERROR`, `CONFLICT`, `INTERNAL_ERROR`, `SERVICE_UNAVAILABLE`

### Key data rules

- `google_service_account_key` is **excluded from SQL queries for list responses** (`GET /v1/clients`) — strip it at the query level, not in application code. It is included only on `GET /v1/clients/:id`.
- Inactive clients (`active = false`) are treated as not found on single-record lookups and excluded from list responses.
- Client IDs are human-assigned slugs (e.g. `acme-corp`), not UUIDs.
- Supported timezones: `America/New_York`, `America/Chicago`, `America/Denver`, `America/Los_Angeles`.

### Auth middleware pattern

```typescript
import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";

export const requireApiKey = createMiddleware(async (c, next) => {
  const key = c.req.header("X-API-Key");
  if (!key || key !== c.env.API_KEY) {
    throw new HTTPException(401, { message: "Unauthorized" });
  }
  await next();
});
```

### Testing

Tests run inside the actual CF Workers runtime via `@cloudflare/vitest-pool-workers`. Call routes via `app.request(req, {}, envBindings)` — no HTTP server needed, no CF API mocking. Integration tests live in `tests/integration/`; Zod schema unit tests in `tests/unit/validators/`.

Integration tests need a live `DATABASE_URL` exposed via the `cloudflare:test` module's `env` export (bridged from `process.env.DATABASE_URL` in `vitest.config.ts`'s `miniflare.bindings`) — not `process.env` directly, since test files run inside a workerd isolate. Without it set, DB-backed assertions skip via a `skipIfNoDb` guard rather than fail.

End-to-end smoke tests against a live deployed Worker live in `tests/e2e/` (`vitest.e2e.config.ts`, run via `npm run test:e2e`), gated on `PREVIEW_URL` — they run last, after PR preview deploys and after staging/production releases, and are deliberately shallow (auth + one representative request per resource), not a re-test of business logic.

## Specs reference

- `specs/001-hono-client-api/spec.md` — functional requirements and acceptance scenarios
- `specs/001-hono-client-api/plan.md` — implementation phases and project structure
- `specs/001-hono-client-api/contracts/api.md` — full endpoint contracts with request/response shapes
- `specs/001-hono-client-api/data-model.md` — DB schema, TypeScript interfaces, validation rules
- `specs/001-hono-client-api/research.md` — rationale behind platform, DB driver, auth, and testing choices

## Git Conventions

### Branch Naming
Branches follow `{type}/{number}-{description}` (e.g. `feat/003-ci-cd`, `fix/004-auth-bug`).

Valid types: `feat` · `fix` · `chore` · `docs` · `refactor` · `test` · `ci` · `build`

### Commit Messages
All commits must follow [Conventional Commits](https://www.conventionalcommits.org/):
```
feat: add preview deployments
fix: correct health check error handling
chore: update dependencies
ci: add GitHub Actions workflow
```
Types that trigger semantic releases: `feat` → minor bump, `fix` → patch bump, breaking change footer → major bump.

## Active Technologies
- TypeScript 5.x / Node 20 (image: `node:20`) + Hono 4.x, Wrangler 3.x, @neondatabase/serverless (002-dockerize-app)
- Neon PostgreSQL (external; accessed via `DATABASE_URL` at runtime) (002-dockerize-app)
- TypeScript 5.x / Node 20 + Wrangler 3.x, `cloudflare/wrangler-action@v3`, `semantic-release` ^24.x (feat/003-ci-cd)
- N/A (no new data storage; Neon credentials passed per-environment via GitHub Secrets) (feat/003-ci-cd)
- TypeScript 5.x / Node 20 + Hono 4.x, Wrangler 3.x, `drizzle-orm` ^0.38.x (runtime), `drizzle-kit` ^0.30.x (devDep), `@neondatabase/serverless` ^1.x (unchanged), `tsx` (devDep, migration runner) (feat/005-drizzle-client)
- Neon PostgreSQL — existing `clients` table (V001–V004 applied by `sol-notification-service`); Drizzle owns all future migrations via `sol_api_migrations` tracking table (feat/005-drizzle-client)

## Recent Changes
- 002-dockerize-app: Added TypeScript 5.x / Node 20 (image: `node:20-slim`) + Hono 4.x, Wrangler 3.x, @neondatabase/serverless
