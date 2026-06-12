# API Contracts: Drizzle ORM + Client Integration Fields

All existing endpoint contracts are unchanged except for the addition of new fields in request/response bodies. Auth, status codes, error envelopes, and response shapes are identical.

---

## Updated: `GET /v1/clients`

**Change**: Response includes six new nullable fields per client record. `sanity_api_token` and `github_token` do NOT exist as columns — no exclusion needed.

**Response** `200`:
```json
{
  "success": true,
  "data": [
    {
      "id": "acme-corp",
      "name": "Acme Corp",
      "email": "contact@acme.com",
      "ga4_property_id": null,
      "active": true,
      "settings": {},
      "timezone": "America/New_York",
      "created_at": "2024-01-01T00:00:00Z",
      "google_service_account_email": null,
      "sanity_project_id": "abc123",
      "sanity_production_dataset": "production",
      "sanity_staging_dataset": "staging",
      "github_repo": "owner/repo",
      "github_default_branch": "main",
      "github_test_branch": "develop"
    }
  ]
}
```

Note: `google_service_account_key` continues to be excluded at the SQL query level.

---

## Updated: `GET /v1/clients/:id`

**Change**: Response includes six new fields. All fields including `google_service_account_key` are present.

**Response** `200`:
```json
{
  "success": true,
  "data": {
    "id": "acme-corp",
    "name": "Acme Corp",
    "email": "contact@acme.com",
    "ga4_property_id": null,
    "active": true,
    "settings": {},
    "timezone": "America/New_York",
    "created_at": "2024-01-01T00:00:00Z",
    "google_service_account_email": null,
    "google_service_account_key": null,
    "sanity_project_id": "abc123",
    "sanity_production_dataset": "production",
    "sanity_staging_dataset": "staging",
    "github_repo": "owner/repo",
    "github_default_branch": "main",
    "github_test_branch": "develop"
  }
}
```

---

## Updated: `POST /v1/clients`

**Change**: Request body accepts six new optional fields.

**Request body** (new fields shown; all existing fields unchanged):
```json
{
  "id": "acme-corp",
  "name": "Acme Corp",
  "email": "contact@acme.com",
  "sanity_project_id": "abc123",
  "sanity_production_dataset": "production",
  "sanity_staging_dataset": "staging",
  "github_repo": "owner/repo",
  "github_default_branch": "main",
  "github_test_branch": "develop"
}
```

| Field | Required | Default | Validation |
|-------|----------|---------|------------|
| `sanity_project_id` | No | null | string, nullable |
| `sanity_production_dataset` | No | null | string, nullable |
| `sanity_staging_dataset` | No | null | string, nullable |
| `github_repo` | No | null | string, nullable |
| `github_default_branch` | No | `"main"` | string, nullable |
| `github_test_branch` | No | null | string, nullable |

**Response** `201`: Full client record including all new fields.

---

## Updated: `PATCH /v1/clients/:id`

**Change**: Request body accepts six new optional fields for partial update.

**Request body** (any subset of new fields):
```json
{
  "sanity_project_id": "xyz789",
  "github_default_branch": "develop"
}
```

All new fields follow the same partial-update semantics as existing fields — only provided fields are updated; unprovided fields are left unchanged.

**Response** `200`: Full updated client record.

---

## Unchanged Endpoints

- `GET /health` — no changes
- Error shapes, status codes, auth behaviour — no changes
