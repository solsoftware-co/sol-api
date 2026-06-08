# Docker File Contracts

**Feature**: 002-dockerize-app  
**Date**: 2026-05-03

This feature delivers three new files at the repo root and one modification to `wrangler.toml`.

---

## `Dockerfile`

Single-stage image based on `node:20-slim`. Installs dependencies at build time. Source is injected via volume mount at runtime — not copied into the image.

```dockerfile
FROM node:20-slim

WORKDIR /app

ENV CI=true

COPY package.json package-lock.json ./
RUN npm ci

COPY wrangler.toml tsconfig.json vitest.config.ts ./

EXPOSE 8787

CMD ["npx", "wrangler", "dev"]
```

**Key properties:**
- `CI=true` suppresses wrangler interactive prompts in non-TTY environments
- `npm ci` installs the correct Linux `workerd` binary (platform-specific; must not be volume-mounted from macOS host)
- Source files (`src/`, `tests/`) are NOT copied — they are provided by volume mount at runtime
- `EXPOSE 8787` documents the port; actual publishing is in `docker-compose.yml`

---

## `docker-compose.yml`

Two services: `api` (long-running dev server) and `test` (one-shot test runner, profile-gated).

```yaml
services:
  api:
    build: .
    ports:
      - "8787:8787"
    env_file:
      - .dev.vars
    volumes:
      - ./src:/app/src
      - ./tests:/app/tests

  test:
    build: .
    env_file:
      - .dev.vars
    volumes:
      - ./src:/app/src
      - ./tests:/app/tests
    command: ["npx", "vitest", "run"]
    profiles:
      - test
```

**Key properties:**
- `env_file: .dev.vars` injects `DATABASE_URL`, `API_KEY`, `ENVIRONMENT` into `process.env`; wrangler reads them identically to reading the `.dev.vars` file from disk
- `./src` and `./tests` are bind-mounted for hot-reload; `node_modules` is NOT mounted
- `profiles: [test]` gates the test service — `docker compose up` only starts `api`
- No secrets baked into the image; `.dev.vars` is never copied into the build context

---

## `wrangler.toml` — `[dev]` section addition

Add the following section to the existing `wrangler.toml` (local dev only; does not affect deployed Workers):

```toml
[dev]
ip = "0.0.0.0"
port = 8787
```

**Key properties:**
- `ip = "0.0.0.0"` makes the dev server reachable from outside the container (Docker host)
- `port = 8787` matches the published port in `docker-compose.yml`
- Applies to `wrangler dev` regardless of whether run inside or outside Docker — both work

---

## `.dockerignore`

Prevents `node_modules`, secrets, and git history from entering the build context.

```
node_modules
.dev.vars
.git
.gitignore
dist
*.log
```

---

## Usage Contract

| Goal | Command |
|------|---------|
| Start dev server | `docker compose up` |
| Start dev server (rebuild first) | `docker compose up --build` |
| Run tests | `docker compose run --rm test` |
| Rebuild image (after `npm install`) | `docker compose build` |
| Stop dev server | `docker compose down` |
