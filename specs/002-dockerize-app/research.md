# Research: Docker Local Development Environment

**Feature**: 002-dockerize-app  
**Date**: 2026-05-03

## Decision 1: Base Image

**Decision**: `node:20-slim`  
**Rationale**: The `workerd` binary bundled by Wrangler is compiled for glibc (Debian/GNU Linux). Alpine Linux uses musl libc — there is no musl build of `workerd`, so `node:20-alpine` fails at runtime. `node:20-slim` is Debian-based, has glibc, and is small (~200 MB vs full ~1 GB).  
**Alternatives considered**: `node:20-alpine` (fails — musl/glibc mismatch), `node:lts-slim` (acceptable but pinning to Node 20 matches the project's current runtime).

## Decision 2: `node_modules` Placement

**Decision**: `node_modules` stays inside the image layer; it is never volume-mounted from the host.  
**Rationale**: `workerd` ships platform-specific binaries. On macOS, npm installs `@cloudflare/workerd-darwin-arm64`. Inside a Linux container, wrangler needs `@cloudflare/workerd-linux-64`. Mounting host `node_modules` into the container provides the wrong binary and both `wrangler dev` and `npm test` will fail. `npm ci` runs inside the image at build time to install the correct Linux binary.  
**Alternatives considered**: Anonymous volume override — does not work here because only `src/` and `tests/` are mounted (not the whole `/app`), so `node_modules` is never shadowed.

## Decision 3: Wrangler Host Binding

**Decision**: Add `[dev] ip = "0.0.0.0"` to `wrangler.toml`.  
**Rationale**: `wrangler dev` defaults to binding on `localhost` / `127.0.0.1`, which is unreachable from outside the container. Setting `ip = "0.0.0.0"` in `wrangler.toml` makes the dev server accessible on all interfaces. Configuring it in `wrangler.toml` is cleaner than a CLI flag because `npm run dev` picks it up without changes to `package.json`.  
**Alternatives considered**: `--ip 0.0.0.0` as a CLI flag in the Docker CMD (works but is more brittle).

## Decision 4: Secret / Env Var Injection

**Decision**: Volume-mount `.dev.vars` into the container as a read-only file (`./.dev.vars:/app/.dev.vars:ro`). Do not copy it into the image.  
**Rationale**: Wrangler reads `.dev.vars` as a file from disk to populate Worker bindings (`c.env`). It does NOT read from `process.env` — the Worker sandbox is isolated from Node's environment. Using `env_file:` in docker-compose injects vars into `process.env`, which is invisible to the Worker runtime. Mounting the file directly lets Wrangler discover and read it exactly as it does outside Docker. The file is never baked into the image (it is listed in `.dockerignore`).  
**Alternatives considered**: `env_file:` in docker-compose — injects into `process.env` only, not Worker bindings; confirmed incorrect by observing that only `ENVIRONMENT` (from `wrangler.toml [vars]`) appeared in the wrangler binding list at runtime.

## Decision 5: Test Runner Service

**Decision**: Separate `test` service in `docker-compose.yml` using `profiles: [test]` with `command: ["npx", "vitest", "run"]`.  
**Rationale**: Tests run to completion and exit — they are not a long-running service. A profile-gated service prevents the test runner from starting on `docker compose up`. Running via `docker compose run --rm test` gives a clean, one-shot execution.  
**Alternatives considered**: `docker compose run --rm api npx vitest run` (works but less explicit); separate `Dockerfile.test` (unnecessary complexity).

## Decision 6: Hot-Reload

**Decision**: Mount `./src` and `./tests` as bind volumes. Wrangler's esbuild file watcher detects changes inside the container.  
**Rationale**: Wrangler uses esbuild's watcher internally. When `./src` is bind-mounted, host file changes propagate to the container FS and trigger a worker reload. On macOS with Docker Desktop, there is a small inotify delay (~300ms) — normal and non-breaking.  
**Alternatives considered**: Rebuilding the image on each change — unacceptable DX; polling-mode watchers — unnecessary given bind mounts work.

## Decision 7: Wrangler Interactive Prompts

**Decision**: Set `CI=true` in the Dockerfile to suppress interactive Wrangler prompts.  
**Rationale**: `wrangler dev` may emit interactive TTY prompts in some versions when running in a non-TTY container (e.g., consent prompts, update notices). Setting `CI=true` in the environment signals to Wrangler that it is running in a non-interactive context and suppresses these.  
**Alternatives considered**: `--no-interactive` flag — wrangler 3.x does not document this flag; `CI=true` is the canonical approach used by Wrangler's own CI test suite.

## Gotcha Summary

| Gotcha | Resolution |
|--------|-----------|
| `workerd` binary is platform-specific | Never volume-mount `node_modules`; `npm ci` inside image |
| `wrangler dev` binds to `localhost` | `[dev] ip = "0.0.0.0"` in `wrangler.toml` |
| Alpine musl/glibc mismatch with `workerd` | Use `node:20-slim` (glibc/Debian) |
| Wrangler interactive prompts in non-TTY | `ENV CI=true` in Dockerfile |
| `.dev.vars` not in container FS | `env_file: .dev.vars` in docker-compose injects via `process.env` |
| Rebuilding after `npm install` changes | `docker compose build`; layer cache invalidates correctly |
