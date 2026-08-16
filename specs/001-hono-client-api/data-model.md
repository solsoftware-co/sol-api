# Data Model: Sol API

**Feature**: 001-hono-client-api | **Date**: 2026-04-22

The API is a read/write layer over the existing Neon PostgreSQL schema owned by `sol-notification-service`. No schema changes are made by this feature. The API exposes a curated view of the data — certain sensitive columns are stripped from all responses.

---

## Entity: Client

### Source table: `clients`

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| id | TEXT | No | Primary key; human-assigned slug |
| name | TEXT | No | Display name |
| email | TEXT | No | Primary contact / fallback recipient |
| ga4_property_id | TEXT | Yes | Google Analytics 4 property |
| active | BOOLEAN | No | Soft-delete flag; default TRUE |
| settings | JSONB | No | Open-ended config blob (banner, recipients, etc.) |
| timezone | TEXT | No | One of 4 supported US timezones; default `America/Chicago` |
| google_service_account_email | TEXT | Yes | GSA email for Sheets integration |
| google_service_account_key | TEXT | Yes | Excluded from all responses by default; included on `GET /v1/clients/:id` only with `?include=google_credentials` |
| slack_webhook_url | TEXT | Yes | Excluded from all responses by default; included on `GET /v1/clients/:id` only with `?include=slack_credentials` |
| created_at | TIMESTAMPTZ | No | Auto-set on insert |

### API response shapes

**ClientRecord** — full row shape; never returned as-is except when both `?include=` values are requested together on `GET /v1/clients/:id`
```typescript
interface ClientRecord {
  id: string;
  name: string;
  email: string;
  ga4_property_id: string | null;
  active: boolean;
  settings: Record<string, unknown>;
  timezone: "America/New_York" | "America/Chicago" | "America/Denver" | "America/Los_Angeles";
  google_service_account_email: string | null;
  google_service_account_key: string | null;
  slack_webhook_url: string | null;
  created_at: string; // ISO 8601
}
```

**ClientSummary** — returned from `GET /v1/clients` (list), and the default response from `GET /v1/clients/:id`
```typescript
interface ClientSummary {
  id: string;
  name: string;
  email: string;
  ga4_property_id: string | null;
  active: boolean;
  settings: Record<string, unknown>;
  timezone: "America/New_York" | "America/Chicago" | "America/Denver" | "America/Los_Angeles";
  google_service_account_email: string | null;
  // google_service_account_key, slack_webhook_url intentionally absent — see ClientWithCredentials
  created_at: string; // ISO 8601
}
```

**ClientWithCredentials** — `ClientSummary` plus whichever credential fields were requested via `?include=` on `GET /v1/clients/:id`; each is independently optional
```typescript
type ClientWithCredentials = ClientSummary &
  Partial<Pick<ClientRecord, "google_service_account_key" | "slack_webhook_url">>;
```

### Validation rules (create / update)

| Field | Rule |
|-------|------|
| id | Required on create; 1–100 chars; no spaces |
| name | Required on create; 1–200 chars |
| email | Required on create; must contain `@` |
| timezone | When provided: must be one of the 4 supported values |
| active | Boolean only |
| settings | Any valid JSON object |
| google_service_account_email | Optional; when provided must contain `@` |
| google_service_account_key | Accepted on create/update; excluded from responses unless `?include=google_credentials` |
| slack_webhook_url | Optional; when provided must be a valid URL; excluded from responses unless `?include=slack_credentials` |

### State transitions

```
[created: active=true] → [deactivated: active=false]
```
Deletion is not supported. Deactivation via PATCH is the only lifecycle transition.

---

## Entity: Notification Log

### Source table: `notification_logs`

Read-only via this API (writes go through the notification service directly).

| Column | Type | Notes |
|--------|------|-------|
| id | BIGSERIAL | Auto-increment PK |
| client_id | TEXT | FK → clients.id |
| workflow | TEXT | e.g. `weekly-analytics-report` |
| event_name | TEXT | e.g. `analytics/report.requested` |
| outcome | TEXT | `sent` / `failed` / `skipped` |
| recipient_email | TEXT | Actual delivery address |
| subject | TEXT | Email subject line |
| resend_id | TEXT | Resend.com message ID |
| error_message | TEXT | Set on `failed` outcomes |
| metadata | JSONB | Arbitrary workflow context |
| created_at | TIMESTAMPTZ | Auto-set |

**Note**: Notification log endpoints are out of scope for this feature. Included here for schema completeness and future planning.

---

## Environment Bindings (Cloudflare Workers)

| Binding | Type | Required | Description |
|---------|------|----------|-------------|
| DATABASE_URL | Secret | Yes | Neon connection string |
| API_KEY | Secret | Yes | Shared key for all consumers |
| ENVIRONMENT | Var | Yes | `development` / `preview` / `production` |
