# Implementation Plan: Docker Local Development Environment

**Branch**: `002-dockerize-app` | **Date**: 2026-05-03 | **Spec**: [spec.md](./spec.md)  
**Input**: Feature specification from `specs/002-dockerize-app/spec.md`

## Summary

Add Docker and Docker Compose support as an optional local development path. Developers can start the API or run tests with a single `docker compose` command without installing Node, Wrangler, or project-specific tooling directly on their machine. The implementation wraps `wrangler dev` inside a Linux container, mounts source for hot-reload, and injects secrets from the existing `.dev.vars` file.

## Technical Context

**Language/Version**: TypeScript 5.x / Node 20 (image: `node:20-slim`)  
**Primary Dependencies**: Hono 4.x, Wrangler 3.x, @neondatabase/serverless  
**Storage**: Neon PostgreSQL (external; accessed via `DATABASE_URL` at runtime)  
**Testing**: Vitest + @cloudflare/vitest-pool-workers  
**Target Platform**: Docker container (linux/amd64 or linux/arm64 on Apple Silicon via Docker Desktop)  
**Project Type**: Web service — infrastructure/tooling addition  
**Performance Goals**: Source changes reflected within 5 seconds; `docker compose up` to first request under 30 seconds  
**Constraints**: `node_modules` must live in the image (platform-specific `workerd` binary); secrets never baked in  
**Scale/Scope**: Local development only; three new files + one `wrangler.toml` change

## Constitution Check

**Principle VI — Minimal Infrastructure & Developer Experience** (v2.1.0):  
✅ `wrangler dev` still works standalone — Docker is optional  
✅ Docker wraps `wrangler dev` internally (CMD in Dockerfile)  
✅ Secrets injected at runtime via `env_file`; never baked into image  
✅ `npm ci` keeps install time deterministic  
✅ Three new files + one config change — no new services or infrastructure beyond Docker itself  

**All other principles**: Not affected (no route changes, no data model changes, no auth changes).

## Project Structure

### Documentation (this feature)

```text
specs/002-dockerize-app/
├── plan.md              # This file
├── research.md          # Phase 0 — base image, node_modules, binding, secrets
├── contracts/
│   └── docker.md        # Phase 1 — file contracts for all deliverables
├── quickstart.md        # Phase 1 — developer quickstart guide
└── tasks.md             # Phase 2 output (/speckit.tasks — not yet created)
```

### Source Code (repository root)

```text
Dockerfile               # NEW — node:20-slim image, npm ci, wrangler dev CMD
docker-compose.yml       # NEW — api service + test service (profile-gated)
.dockerignore            # NEW — excludes node_modules, .dev.vars, .git
wrangler.toml            # MODIFIED — add [dev] section (ip = "0.0.0.0", port = 8787)
```

No changes to `src/`, `tests/`, `package.json`, or any other existing files.

## Implementation Phases

### Phase 1 — Core Docker Setup (P1)

Delivers: developer can `docker compose up` and hit the API.

1. Add `[dev]` section to `wrangler.toml`:
   ```toml
   [dev]
   ip = "0.0.0.0"
   port = 8787
   ```
2. Create `Dockerfile`:
   - Base: `node:20-slim`
   - `ENV CI=true`
   - `COPY package.json package-lock.json ./` + `RUN npm ci`
   - `COPY wrangler.toml tsconfig.json vitest.config.ts ./`
   - `EXPOSE 8787`
   - `CMD ["npx", "wrangler", "dev"]`
3. Create `docker-compose.yml`:
   - `api` service: build `.`, ports `8787:8787`, `env_file: .dev.vars`, volumes `./src:/app/src` and `./tests:/app/tests`
4. Create `.dockerignore`:
   - Exclude `node_modules`, `.dev.vars`, `.git`, `*.log`, `dist`
5. Verify: `docker compose up --build` → `curl http://localhost:8787/health` returns `{ success: true }` equivalent

### Phase 2 — Test Runner Service (P2)

Delivers: developer can `docker compose run --rm test` to run tests.

1. Add `test` service to `docker-compose.yml`:
   - Same build context as `api`
   - `env_file: .dev.vars`
   - Same volume mounts
   - `command: ["npx", "vitest", "run"]`
   - `profiles: [test]`
2. Verify: `docker compose run --rm test` passes all existing tests

## Complexity Tracking

No constitution violations. Docker was added to the approved stack via the 2.1.0 MINOR amendment.
