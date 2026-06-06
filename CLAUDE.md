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

This API centralizes client data access so consuming services (notification service, future MCP agents) don't hold direct database connections. It exposes five endpoints behind a shared API key.

### Source layout (planned)

```
src/
├── index.ts              # Hono app entry + CF Worker fetch export
├── routes/
│   ├── health.ts         # GET /health (no auth)
│   └── clients.ts        # GET /v1/clients, GET /v1/clients/:id, POST, PATCH
├── middleware/
│   ├── auth.ts           # X-API-Key enforcement via HTTPException
│   └── error.ts          # Global handler → envelope shape
├── lib/db.ts             # neon() factory (fetch transport, no ws)
├── types/index.ts        # Env bindings, ErrorCode enum, ApiResponse<T>
└── validators/client.ts  # Zod schemas for create + update payloads
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

## Specs reference

- `specs/001-hono-client-api/spec.md` — functional requirements and acceptance scenarios
- `specs/001-hono-client-api/plan.md` — implementation phases and project structure
- `specs/001-hono-client-api/contracts/api.md` — full endpoint contracts with request/response shapes
- `specs/001-hono-client-api/data-model.md` — DB schema, TypeScript interfaces, validation rules
- `specs/001-hono-client-api/research.md` — rationale behind platform, DB driver, auth, and testing choices

## Active Technologies
- TypeScript 5.x / Node 20 (image: `node:20`) + Hono 4.x, Wrangler 3.x, @neondatabase/serverless (002-dockerize-app)
- Neon PostgreSQL (external; accessed via `DATABASE_URL` at runtime) (002-dockerize-app)

## Recent Changes
- 002-dockerize-app: Added TypeScript 5.x / Node 20 (image: `node:20-slim`) + Hono 4.x, Wrangler 3.x, @neondatabase/serverless
