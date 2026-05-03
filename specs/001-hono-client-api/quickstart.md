# Quickstart: Sol API (Local Development)

## Prerequisites

- Node.js 20+
- Wrangler CLI: `npm install -g wrangler`
- Cloudflare account (free tier sufficient for dev)
- Access to the Neon dev branch `DATABASE_URL`

## Setup

```bash
git clone <repo> sol-api
cd sol-api
npm install
```

Create `.dev.vars` in the project root (gitignored):

```
DATABASE_URL=postgres://user:pass@ep-xxx.neon.tech/neondb?sslmode=require
API_KEY=dev-local-key
ENVIRONMENT=development
```

## Run locally

```bash
npm run dev
# Starts wrangler dev server on http://localhost:8787
```

## Test the API

```bash
# Health check (no auth)
curl http://localhost:8787/health

# List clients
curl -H "X-API-Key: dev-local-key" http://localhost:8787/v1/clients

# Get a client
curl -H "X-API-Key: dev-local-key" http://localhost:8787/v1/clients/acme-corp
```

## Run tests

```bash
npm test
```

## Deploy

```bash
# Set secrets in Cloudflare (one-time)
wrangler secret put DATABASE_URL
wrangler secret put API_KEY

# Deploy
npm run deploy
```

## Environment Variables Reference

| Variable | Where Set | Description |
|----------|-----------|-------------|
| DATABASE_URL | `.dev.vars` / CF secret | Neon connection string |
| API_KEY | `.dev.vars` / CF secret | Shared API key for consumers |
| ENVIRONMENT | `wrangler.toml` vars | `development` / `preview` / `production` |
