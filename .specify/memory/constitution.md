<!--
SYNC IMPACT REPORT
==================
Version change: 1.2.0 → 2.0.0
Bump type: MAJOR — all six principles replaced; governing service changed from
  sol-notification-service (Inngest/Vercel, event-driven) to sol-api (Hono/Cloudflare
  Workers, REST API). The prior notification-service constitution was carried into
  this repo at project setup but never applied to sol-api's actual architecture.

Modified principles:
  - I.   Event-Driven Workflow First       → I.   REST-First, Resource-Oriented Design
  - II.  Multi-Environment Safety          → II.  Multi-Environment Safety
          (intent retained; tooling updated: Cloudflare secrets/bindings replace
           VERCEL_ENV / EMAIL_MODE)
  - III. Multi-Tenant by Design            → III. Sensitive Data Protection
          (tenant isolation retained; scope expanded to cover credential-field
           stripping and API key authentication)
  - IV.  Observability by Default          → IV.  Consistent Response Shape & Observability
          (Inngest step-name conventions replaced with HTTP envelope + health-check rules)
  - V.   AI-Agent Friendly Codebase        → V.   AI-Agent Friendly Codebase
          (retained intent; path references updated for sol-api structure)
  - VI.  Minimal Infrastructure & DX       → VI.  Minimal Infrastructure & Developer Experience
          (retained intent; Inngest Dev Server → wrangler dev; Vercel → Cloudflare Workers)

Added sections: N/A (same section structure retained)
Removed sections: N/A

Templates requiring updates:
  ✅ plan-template.md — Constitution Check uses dynamic placeholder
       "[Gates determined based on constitution file]"; no hard-coded notification-service
       gates exist. No changes required.
  ✅ spec-template.md — Fully generic; no notification-service-specific content.
       No changes required.
  ✅ tasks-template.md — Fully generic; no notification-service-specific task types.
       No changes required.
  ✅ agent-file-template.md — Fully generic placeholder template.
       No changes required.

Deferred TODOs:
  - TODO(CLAUDE_MD): .claude/CLAUDE.md does not yet exist. Principle V requires it to
      be kept current with implementation patterns. Must be created once Phases 1–3 of
      feature/001-hono-client-api are complete and canonical patterns are established.
  - TODO(REVIEWER): Constitution sign-off reviewer is TBD.
-->

# Sol API Constitution

## Core Principles

### I. REST-First, Resource-Oriented Design

All capabilities MUST be exposed as versioned HTTP REST endpoints following standard
resource-oriented conventions. Every route MUST return a consistent JSON envelope.
Database operations MUST NOT be performed outside the database layer (`src/lib/db.ts`).
All routes MUST be organized by resource under `src/routes/`.

**Non-negotiable rules:**
- All endpoints MUST be versioned under a path prefix (e.g., `/v1/clients`)
- `GET` endpoints MUST NOT produce side effects
- `POST` responses MUST return `201 Created` with the created resource
- `PATCH` MUST support partial updates — only provided fields are modified; unprovided
  fields are left unchanged
- All successful responses MUST use the envelope: `{ success: true, data: <T> }`
- All error responses MUST use the envelope:
  `{ success: false, error: { code: ErrorCode, message: string, details?: unknown } }`
- HTTP status codes MUST accurately reflect the outcome:
  200 (ok), 201 (created), 400 (bad request), 401 (unauthorized), 404 (not found),
  409 (conflict), 422 (unprocessable entity), 503 (service unavailable)

**Rationale:** A uniform REST contract with a consistent response envelope allows consuming
services (notification service, future MCP agents) to integrate without per-endpoint
negotiation. Predictable status codes and error shapes prevent fragile client-side branching.

### II. Multi-Environment Safety

All code MUST behave correctly across local, preview, and production environments without
source-code modification. Environment-specific behavior MUST be controlled exclusively via
Cloudflare Workers bindings and secrets — never via hardcoded conditionals on environment
names, URLs, or other non-binding signals.

**Non-negotiable rules:**
- Local development MUST use `.dev.vars` for secrets; this file MUST be gitignored
- `DATABASE_URL` MUST use a separate value per environment (local Neon dev branch, preview
  branch, production branch); credentials MUST NOT be shared across environments
- `API_KEY` MUST be stored as a Cloudflare Secret per environment
  (`wrangler secret put API_KEY`); it MUST NOT appear in `wrangler.toml` or source files
- The `ENVIRONMENT` binding MUST be declared in `wrangler.toml` per environment section
  and MUST appear in health check responses
- No environment-specific string literals (URLs, emails, IDs) MUST appear in source files

**Rationale:** Cloudflare's per-environment secret management enforces isolation at the
platform level without code changes between deployments. `.dev.vars` provides a safe local
override mechanism that cannot be accidentally committed.

### III. Sensitive Data Protection

Credentials and sensitive client data MUST be protected at the SQL query layer before any
response is constructed. Sensitive fields MUST be excluded in SQL `SELECT` statements —
not stripped in application code after retrieval — so they cannot leak through a missed
code path.

**Non-negotiable rules:**
- `google_service_account_key` MUST be excluded from all SQL `SELECT` statements in list
  queries; it MAY be included only in single-record lookups (`GET /v1/clients/:id`)
- No client PII (email addresses, service account credentials, GA4 property IDs) MUST
  appear in source files, `wrangler.toml`, or committed configuration
- All API requests MUST be authenticated via the `X-API-Key` header before any business
  logic executes; unauthenticated requests MUST be rejected with `401`
- API keys and database credentials MUST be stored exclusively as Cloudflare Secrets
- Cross-tenant data access MUST be architecturally impossible via parameterized queries
  scoped to `client_id`; direct table scans that return all clients MUST require explicit
  authorization

**Rationale:** The `google_service_account_key` field contains OAuth2 service account
credentials. Stripping it at the SQL layer eliminates the risk of future code paths
inadvertently including it. This is a hard requirement verified by automated tests
(per FR-005 and SC-004 of the initial feature spec).

### IV. Consistent Response Shape & Observability

Every response — success or error — MUST conform to the defined JSON envelope. Every
deployment MUST expose a `/health` endpoint confirming both service availability and live
database connectivity.

**Non-negotiable rules:**
- The success envelope MUST be: `{ success: true, data: <T> }`
- The error envelope MUST be:
  `{ success: false, error: { code: ErrorCode, message: string, details?: unknown } }`
- `ErrorCode` values MUST be defined as a TypeScript enum in `src/types/index.ts`;
  ad-hoc inline string codes in route handlers are prohibited
- `GET /health` MUST return:
  `{ status: "ok" | "error", database: "connected" | "error", environment: string }`
- All unhandled errors MUST be caught by the global error handler in
  `src/middleware/error.ts` and converted to the error envelope before reaching the client
- p95 response time target is < 200ms end-to-end (per SC-002)

**Rationale:** A uniform response shape lets consuming services and future MCP agents parse
all responses identically. The health endpoint is the primary observability signal for
deployment validation and external uptime monitoring.

### V. AI-Agent Friendly Codebase

All routes and features MUST follow the patterns established in the existing implementation
and be accompanied by a corresponding spec in `specs/` before implementation begins.
New routes generated by AI agents MUST be verifiable against the spec without requiring
runtime context.

**Non-negotiable rules:**
- Every feature MUST have a corresponding spec directory in `specs/` before implementation
- All Zod validation schemas MUST be defined in `src/validators/` before route handlers
  are written
- All shared TypeScript types MUST be defined in `src/types/index.ts` before use elsewhere
- Route handlers MUST delegate all database operations to `src/lib/db.ts`;
  inline SQL in route handlers is prohibited
- `.claude/CLAUDE.md` MUST be kept current with any pattern changes that affect
  AI-generated route correctness; it MUST reference this constitution

**Rationale:** AI-assisted route creation is a primary future goal (MCP server wrapper).
Consistent, schema-first patterns allow Claude Code and other agents to generate new routes
that are immediately correct and testable without additional context.

### VI. Minimal Infrastructure & Developer Experience

The service MUST run entirely via `wrangler dev` with no Docker, container runtimes, or
cloud-provider emulators required for local development. All production dependencies MUST
have free tiers sufficient for the current scale. New infrastructure components MUST NOT
be introduced without explicit governance amendment.

**Non-negotiable rules:**
- Local development MUST work with `wrangler dev` alone; no additional services required
- The approved stack (see Technology Stack) is fixed; additions require a MINOR amendment;
  replacement of a core component requires a MAJOR amendment
- Time from `git clone` to first successful local test MUST remain under 15 minutes
- All usage MUST stay within free tiers: Cloudflare Workers ≤ 100k requests/day,
  Neon ≤ 512 MB storage, GitHub Actions standard runners
- `DATABASE_URL` for local development MUST point to a Neon dev branch,
  not the production branch

**Rationale:** The Cloudflare Workers V8 isolate runtime eliminates cold starts and
container overhead. `wrangler dev` provides a complete local environment. Keeping setup
minimal ensures rapid onboarding for developers and AI agents alike.

## Technology Stack

The following technologies are approved for this service. Additions or replacements require
a constitution amendment (MINOR bump minimum; MAJOR if a core component is replaced).

| Layer | Technology | Approved Version |
|-------|------------|-----------------|
| Web Framework | Hono | ^4.x |
| Runtime | Cloudflare Workers (V8 isolate) | compatibility_date: 2024-09-23 |
| Language | TypeScript | 5.x |
| Database Client | @neondatabase/serverless | ^1.x |
| Validation | Zod | ^3.x |
| Hosting | Cloudflare Workers | Free tier |
| Local Dev Tooling | Wrangler | ^3.x (devDep) |
| Testing | Vitest + @cloudflare/vitest-pool-workers | ^3.x (devDep) |

**Explicitly out-of-scope:** Email/SMS sending (the notification service's concern),
admin UI, rate limiting (deferred to Cloudflare platform controls), Cloudflare Hyperdrive
(deferred; add if Neon latency is high), MCP server wrapper (separate future feature),
notification log write endpoints.

## Development Standards

### Project Structure Compliance

Source code MUST conform to the directory layout established in the initial feature plan
and enforced here:

```
src/
├── index.ts                  # Hono app entry point + Cloudflare Worker fetch export
├── routes/
│   ├── health.ts             # GET /health — service + DB status
│   └── clients.ts            # GET /v1/clients, GET /v1/clients/:id,
│                             # POST /v1/clients, PATCH /v1/clients/:id
├── middleware/
│   ├── auth.ts               # X-API-Key enforcement (401 on failure)
│   └── error.ts              # Global error handler → envelope shape
├── lib/
│   └── db.ts                 # Neon fetch-transport client factory
├── types/
│   └── index.ts              # ClientRecord, Env bindings, ErrorCode enum, ApiResponse<T>
└── validators/
    └── client.ts             # Zod schemas for create + update payloads

tests/
├── unit/
│   └── validators/           # Zod schema unit tests
└── integration/
    ├── health.test.ts
    └── clients.test.ts       # Full route tests via app.request()

specs/                        # One directory per feature (required before implementation)
wrangler.toml                 # Worker config; per-environment sections; no secrets
.dev.vars                     # Local secrets — gitignored
.claude/CLAUDE.md             # AI agent instructions (references this constitution)
```

### Code Quality Gates

A route or feature is NOT considered complete until all of the following pass:

- [ ] Corresponding spec exists in `specs/` describing the feature
- [ ] All Zod validation schemas are defined in `src/validators/` before route handlers
- [ ] All shared TypeScript types are defined in `src/types/index.ts`
- [ ] Route handlers delegate all SQL to `src/lib/db.ts` (no inline SQL in handlers)
- [ ] `google_service_account_key` is excluded at the SQL `SELECT` level in all list queries
- [ ] Auth middleware is applied at the app level (not per-route)
- [ ] All error paths return the defined error envelope via the global error handler
- [ ] Integration tests cover: happy path, not-found (404), missing auth (401), and
      validation failure (422) for each route

### Security Requirements

- API keys and database credentials MUST be stored as Cloudflare Secrets exclusively
- `.dev.vars` MUST be listed in `.gitignore` and MUST NOT be committed
- No client PII (emails, GA4 property IDs, service account credentials) MUST appear in
  source files or `wrangler.toml`
- `google_service_account_key` MUST be excluded at the SQL query layer from all list
  responses — not filtered in application code
- Client IDs and email addresses MUST be validated (non-empty, correct format) before
  any database write
- `DATABASE_URL` MUST use separate values per environment; credentials MUST NOT be shared

## Governance

This constitution supersedes all other architectural guidance for the Sol API service.
In conflicts between this document and any other guide (README, inline comments, prior
practice), this constitution takes precedence.

**Amendment procedure:**
1. Identify the affected principle(s) and determine the version bump type (PATCH/MINOR/MAJOR)
2. Update this file with new version, today's date in `Last Amended`, and revised content
3. Run the Sync Impact Report checklist: update plan-template, spec-template, tasks-template,
   and agent-file-template as needed
4. Update `.claude/CLAUDE.md` if any route or implementation pattern changes
5. Document a migration path in the Sync Impact Report for routes already implemented

**Versioning policy:**
- **MAJOR**: Principle removal, redefinition, or replacement of a core technology
- **MINOR**: New principle added, new section, or materially expanded guidance
- **PATCH**: Clarifications, wording fixes, non-semantic refinements

**Compliance review:**
All PRs adding or modifying routes MUST verify compliance with the Constitution Check
gates in `plan-template.md` before merge. Violations of Principle VI (unapproved
infrastructure) MUST be justified in the plan's Complexity Tracking table with explicit
rationale for why no simpler approach exists.

**Version**: 2.0.0 | **Ratified**: 2026-04-22 | **Last Amended**: 2026-04-24
