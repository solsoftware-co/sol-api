# API Contract: Sol API v1

**Base URL**: `https://sol-api.{account}.workers.dev` (production)
**Version**: v1
**Auth**: All endpoints except `/health` require `X-API-Key: <key>` header.

---

## Response Envelope

All responses use a consistent envelope:

**Success**
```json
{ "success": true, "data": { ... } }
```

**Success (list)**
```json
{ "success": true, "data": [ ... ] }
```

**Error**
```json
{
  "success": false,
  "error": {
    "code": "NOT_FOUND",
    "message": "Client not found: acme-corp",
    "details": null
  }
}
```

**Error codes**: `UNAUTHORIZED`, `NOT_FOUND`, `VALIDATION_ERROR`, `CONFLICT`, `INTERNAL_ERROR`, `SERVICE_UNAVAILABLE`

---

## Endpoints

### `GET /health`

No auth required. Returns service and database status.

**Response 200**
```json
{
  "success": true,
  "data": {
    "status": "ok",
    "database": "connected",
    "environment": "production",
    "version": "1.8.0"
  }
}
```

`version` is the released `package.json` version, injected at deploy time by CI. Reports `"unknown"` for deployments that didn't go through the release pipeline (e.g. local `wrangler dev`).

**Response 503** — database unreachable
```json
{
  "success": false,
  "error": { "code": "SERVICE_UNAVAILABLE", "message": "Database connection failed" }
}
```

---

### `GET /v1/clients`

List all active clients.

**Auth**: Required

**Query parameters**:

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| limit | integer | none | Max number of records to return |

Returns `ClientSummary` objects — `google_service_account_key` and `slack_webhook_url` are excluded from list responses (use the single-record endpoint with `?include=` when credentials are needed).

**Response 200**
```json
{
  "success": true,
  "data": [
    {
      "id": "acme-corp",
      "name": "Acme Corp",
      "email": "hello@acme.com",
      "ga4_property_id": "properties/123456789",
      "active": true,
      "settings": { "banner": { "imageUrl": "https://..." } },
      "timezone": "America/Chicago",
      "google_service_account_email": "sheets@acme.iam.gserviceaccount.com",
      "created_at": "2026-01-15T00:00:00.000Z"
    }
  ]
}
```

**Response 401** — missing or invalid API key

---

### `GET /v1/clients/:id`

Fetch a single client by ID. Returns 404 if the client does not exist OR is inactive. Returns a `ClientSummary` by default — `google_service_account_key` and `slack_webhook_url` are both excluded, same as the list endpoint. Pass `?include=` with one or more comma-separated values to get specific credentials back, only for the call sites that actually need them.

**Auth**: Required

**Path parameters**:

| Param | Description |
|-------|-------------|
| id | Client ID (e.g., `acme-corp`) |

**Query parameters**:

| Param | Description |
|-------|-------------|
| include | Optional, comma-separated. `google_credentials` includes `google_service_account_key`; `slack_credentials` includes `slack_webhook_url`. Each is independent — requesting one does not include the other. |

**Response 200** (default — `ClientSummary`)
```json
{
  "success": true,
  "data": {
    "id": "acme-corp",
    "name": "Acme Corp",
    "email": "hello@acme.com",
    "ga4_property_id": "properties/123456789",
    "active": true,
    "settings": {},
    "timezone": "America/Chicago",
    "google_service_account_email": "sheets@acme.iam.gserviceaccount.com",
    "created_at": "2026-01-15T00:00:00.000Z"
  }
}
```

**Response 200** (`?include=google_credentials`)
```json
{
  "success": true,
  "data": {
    "id": "acme-corp",
    "name": "Acme Corp",
    "email": "hello@acme.com",
    "ga4_property_id": "properties/123456789",
    "active": true,
    "settings": {},
    "timezone": "America/Chicago",
    "google_service_account_email": "sheets@acme.iam.gserviceaccount.com",
    "google_service_account_key": "-----BEGIN PRIVATE KEY-----\n...",
    "created_at": "2026-01-15T00:00:00.000Z"
  }
}
```

**Response 200** (`?include=slack_credentials`)
```json
{
  "success": true,
  "data": {
    "id": "acme-corp",
    "name": "Acme Corp",
    "email": "hello@acme.com",
    "ga4_property_id": "properties/123456789",
    "active": true,
    "settings": {},
    "timezone": "America/Chicago",
    "google_service_account_email": "sheets@acme.iam.gserviceaccount.com",
    "slack_webhook_url": "https://hooks.slack.com/services/T000/B000/XXXX",
    "created_at": "2026-01-15T00:00:00.000Z"
  }
}
```

`?include=google_credentials,slack_credentials` returns both fields in the same response.

**Response 404**
```json
{
  "success": false,
  "error": { "code": "NOT_FOUND", "message": "Client not found: acme-corp" }
}
```

---

### `POST /v1/clients`

Create a new client.

**Auth**: Required

**Request body**:
```json
{
  "id": "acme-corp",
  "name": "Acme Corp",
  "email": "hello@acme.com",
  "ga4_property_id": "properties/123456789",
  "timezone": "America/Chicago",
  "settings": {},
  "google_service_account_email": null,
  "google_service_account_key": null,
  "slack_webhook_url": null
}
```

| Field | Required | Notes |
|-------|----------|-------|
| id | Yes | Unique slug; no spaces |
| name | Yes | |
| email | Yes | Must contain `@` |
| ga4_property_id | No | |
| timezone | No | Defaults to `America/Chicago` |
| settings | No | Defaults to `{}` |
| google_service_account_email | No | |
| google_service_account_key | No | Stored; not returned by `GET /v1/clients/:id` unless `?include=google_credentials` |
| slack_webhook_url | No | Must be a valid URL. Stored; not returned by `GET /v1/clients/:id` unless `?include=slack_credentials` |

**Response 201**
```json
{
  "success": true,
  "data": { /* full ClientRecord */ }
}
```

**Response 409** — ID already exists
```json
{
  "success": false,
  "error": { "code": "CONFLICT", "message": "Client already exists: acme-corp" }
}
```

**Response 422** — validation failure
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed",
    "details": [
      { "field": "email", "message": "email is required" }
    ]
  }
}
```

---

### `PATCH /v1/clients/:id`

Partially update a client. Only provided fields are updated; omitted fields are unchanged.

**Auth**: Required

**Request body** — all fields optional:
```json
{
  "name": "Acme Corp (Updated)",
  "email": "new@acme.com",
  "ga4_property_id": "properties/999",
  "active": false,
  "timezone": "America/New_York",
  "settings": { "banner": { "imageUrl": "https://..." } },
  "google_service_account_email": "new@acme.iam.gserviceaccount.com",
  "google_service_account_key": "-----BEGIN PRIVATE KEY-----...",
  "slack_webhook_url": "https://hooks.slack.com/services/T000/B000/XXXX"
}
```

**Response 200**
```json
{
  "success": true,
  "data": { /* updated ClientRecord */ }
}
```

**Response 404** — client not found (including inactive clients)

**Response 422** — invalid timezone value, etc.
