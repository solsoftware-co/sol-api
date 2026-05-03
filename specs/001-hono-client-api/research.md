# Research: Sol API — Hono + Cloudflare Workers + Neon

**Feature**: 001-hono-client-api | **Date**: 2026-04-22

---

## Decision 1: Hosting Platform

**Decision**: Cloudflare Workers

**Rationale**: Hono was built first for Cloudflare Workers — the ergonomics are native. Workers run on V8 isolates with ~0ms cold starts (no container spin-up), which is the core requirement for a shared data API that other services call synchronously. The free tier (100k req/day) is sufficient for the current scale; the paid plan ($5/month) adds 10M req/month and 50ms CPU time per invocation if needed.

**Alternatives considered**:
- Vercel Fluid Compute (Pro): Reduces cold starts for Node.js serverless functions. Simpler operationally (already on Vercel). Rejected because Fluid Compute's cold-start reduction is probabilistic (instances must already be warm), whereas Workers are guaranteed ~0ms. Also, Hono-on-Workers is better documented and tested than Hono-on-Vercel.
- Vercel Standard Serverless (Pro): Still has cold starts. Rejected.

---

## Decision 2: Neon Database Connectivity

**Decision**: `@neondatabase/serverless` with fetch transport (no `ws` polyfill)

**Rationale**: Cloudflare Workers cannot hold persistent WebSocket connections across requests, so the `ws` + Pool pattern used in the notification service is not applicable. The `@neondatabase/serverless` package automatically uses its HTTP fetch transport inside CF Workers — import `neon` from `@neondatabase/serverless` and use tagged template literal queries. No additional configuration is needed; the driver detects the CF environment.

**Connection pattern**:
```typescript
import { neon } from "@neondatabase/serverless";
// Inside a handler:
const sql = neon(c.env.DATABASE_URL);
const rows = await sql`SELECT * FROM clients WHERE active = TRUE`;
```

**Alternatives considered**:
- Cloudflare Hyperdrive: A CF-native connection pooler that sits in front of Postgres. Lower latency for repeat queries within a datacenter. Deferred — adds operational complexity (Hyperdrive resource must be provisioned). Can be added later as a performance optimization without changing application code.
- `pg` (node-postgres): Not supported in CF Workers runtime.

---

## Decision 3: API Key Authentication

**Decision**: Custom Hono middleware checking `X-API-Key` header against a `c.env.API_KEY` binding

**Rationale**: Simple, auditable, zero dependencies. Hono's `HTTPException` makes rejection clean. The key is stored as a Cloudflare Workers secret (never in `wrangler.toml`, never in source).

**Pattern**:
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

**Alternatives considered**:
- Bearer token (`Authorization: Bearer <key>`): Standard OAuth2 pattern. Functionally identical for a shared secret. Chose `X-API-Key` because it's semantically clearer for API keys vs. user tokens.
- JWT: Overkill for internal service-to-service auth. No per-request signing benefits here.

---

## Decision 4: Error Response Shape

**Decision**: Consistent envelope: `{ success: false, error: { code: string, message: string, details?: unknown } }`

**Rationale**: Consuming services (notification service, future MCP server) need a predictable shape to detect and handle errors programmatically. Using an envelope means success responses also follow `{ success: true, data: ... }` — a single parse path for all callers.

**Error codes** (string, uppercase snake): `NOT_FOUND`, `UNAUTHORIZED`, `VALIDATION_ERROR`, `INTERNAL_ERROR`, `SERVICE_UNAVAILABLE`.

---

## Decision 5: Testing

**Decision**: Vitest + `@cloudflare/vitest-pool-workers`

**Rationale**: Cloudflare's official Vitest pool runs tests inside the actual Workers runtime — no mocking of CF-specific APIs needed. Tests call `app.request(req, {}, envBindings)` directly. This catches environment binding issues that pure unit tests miss.

---

## Decision 6: Local Development

**Decision**: `wrangler dev` with `.dev.vars` for local secrets

**Rationale**: `wrangler dev` hot-reloads TypeScript and injects `.dev.vars` as environment bindings, matching the production Workers environment exactly. No extra tooling needed.

**`.dev.vars` (gitignored)**:
```
DATABASE_URL=postgres://...
API_KEY=dev-only-key
```
