# Quickstart: Docker Local Development

**Feature**: 002-dockerize-app

## Prerequisites

- Docker Desktop (Mac/Windows) or Docker Engine + Compose (Linux) installed
- `.dev.vars` file at repo root with your configuration (see format below)

## Setup

**1. Create `.dev.vars`** (if it doesn't already exist):

```
DATABASE_URL=postgres://...
API_KEY=dev-local-key
ENVIRONMENT=development
```

This file is gitignored. Never commit it.

**2. Build the image** (one-time; repeat after `npm install` changes):

```bash
docker compose build
```

## Running the App

```bash
docker compose up
```

The API is available at `http://localhost:8787`. Source changes in `src/` are hot-reloaded automatically.

## Running Tests

```bash
docker compose run --rm test
```

## Stopping

```bash
docker compose down
```

## Troubleshooting

**Port 8787 already in use**: Another process (or `wrangler dev` outside Docker) is using the port. Stop it first, or change the host port in `docker-compose.yml` to e.g. `"8788:8787"`.

**`workerd` fails to start**: Rebuild the image — the `node_modules` may be stale. Run `docker compose build --no-cache`.

**Env vars not loading**: Check that `.dev.vars` exists at the repo root and uses `KEY=VALUE` format (no quotes, no `export` prefix).

**Changes not hot-reloading**: Verify the container is running (`docker compose ps`). On macOS, there may be a ~300ms delay before changes are picked up.
