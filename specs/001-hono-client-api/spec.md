# Feature Specification: Sol API — Client Data Service

**Feature Branch**: `feature/001-hono-client-api`
**Created**: 2026-04-22
**Status**: Draft
**Input**: User description: "build out this API using Hono; expose client data currently owned by sol-notification-service; host in /sol-api repo"

## Overview

The notification service currently owns client data (stored in a shared Postgres database) and queries it directly. As additional Sol Software services come online, each would need its own direct DB connection and duplicated query logic. This API centralizes client data access behind a single HTTP service so that the notification service and any future service can consume client records without touching the database directly.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Fetch a Single Client Record (Priority: P1)

A consuming service (e.g., the notification service) needs to look up a client by its ID to retrieve the configuration needed to process a workflow — timezone, GA4 property, email, settings, etc.

**Why this priority**: This is the most frequent call pattern. Every per-client workflow invocation depends on it. Without it, the notification service cannot function.

**Independent Test**: Call the endpoint with a known client ID and verify all expected fields are returned with correct values.

**Acceptance Scenarios**:

1. **Given** a valid, active client ID, **When** the endpoint is called, **Then** the full client record is returned with a 200 status.
2. **Given** a client ID that does not exist, **When** the endpoint is called, **Then** a 404 response is returned with a descriptive error message.
3. **Given** a client ID that exists but is marked inactive, **When** the endpoint is called, **Then** a 404 response is returned (inactive clients are treated as not found).

---

### User Story 2 - List All Active Clients (Priority: P2)

A scheduler or orchestrator needs the full list of active clients to fan out per-client workflow events (e.g., weekly analytics, monthly reports).

**Why this priority**: Powers all scheduler workflows. Without it, schedulers cannot know which clients to process.

**Independent Test**: Call the list endpoint and verify only active clients are returned with all required fields.

**Acceptance Scenarios**:

1. **Given** the database has multiple clients (active and inactive), **When** the list endpoint is called, **Then** only active clients are returned.
2. **Given** the list endpoint is called with a `limit` query parameter, **Then** at most that many records are returned.

---

### User Story 3 - Create a New Client (Priority: P3)

An admin or onboarding process needs to register a new client so they begin receiving notifications and their data appears in the system.

**Why this priority**: Required for onboarding but not needed for day-to-day notification workflows. Existing clients can be seeded directly in the interim.

**Independent Test**: POST a new client record and verify it can be fetched by the returned ID.

**Acceptance Scenarios**:

1. **Given** a valid client payload, **When** a create request is submitted, **Then** the client is persisted and the new record (including generated ID and timestamps) is returned with a 201 status.
2. **Given** a payload missing required fields (name, email), **When** a create request is submitted, **Then** a 422 response is returned listing the missing fields.
3. **Given** a duplicate client ID, **When** a create request is submitted, **Then** a 409 conflict response is returned.

---

### User Story 4 - Update a Client Record (Priority: P4)

An admin needs to update client configuration — changing settings, timezone, email, GA4 property, or Google service account credentials.

**Why this priority**: Lower priority than reads; required for operational management but existing clients won't block notification workflows.

**Independent Test**: Update a field on an existing client and verify the GET endpoint reflects the change.

**Acceptance Scenarios**:

1. **Given** an existing client, **When** a partial update is submitted with valid fields, **Then** only the provided fields are updated and the rest are unchanged.
2. **Given** a non-existent client ID, **When** an update is submitted, **Then** a 404 response is returned.
3. **Given** an invalid timezone value, **When** an update includes a timezone field, **Then** a 422 response is returned.

---

### Edge Cases

- What happens when the database is unreachable? The API should return a 503 with a clear error rather than hanging indefinitely.
- What happens when `settings` JSONB contains unexpected keys? They should be passed through without validation (the shape is open-ended by design).
- What happens with an empty client list? A 200 with an empty array is returned — not a 404.
- What happens when `google_service_account_key` is present in a response? It contains sensitive credentials and must be omitted from all responses by default.

---

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The API MUST expose an endpoint to retrieve a single client by ID, returning all non-sensitive fields.
- **FR-002**: The API MUST expose an endpoint to list all active clients, supporting optional `testOnly` and `limit` query parameters.
- **FR-003**: The API MUST expose an endpoint to create a new client, validating required fields (id, name, email) before persisting.
- **FR-004**: The API MUST expose an endpoint to partially update an existing client's fields.
- **FR-005**: The `google_service_account_key` MUST be returned only from `GET /v1/clients/:id` (single-record lookup) — never from the list endpoint. This field contains credentials required by consuming services (GA4 queries, Google Sheets writes) and is protected by the API key auth layer. It MUST NOT appear in list responses where it would be included unnecessarily.
- **FR-006**: The API MUST return structured JSON error responses (with a consistent shape) for all 4xx and 5xx responses.
- **FR-007**: The API MUST validate that `timezone` values, when provided, belong to the supported set: `America/New_York`, `America/Chicago`, `America/Denver`, `America/Los_Angeles`.
- **FR-008**: The API MUST authenticate all requests using a shared secret (API key) passed via a request header, rejecting unauthenticated calls with a 401.
- **FR-009**: Inactive clients MUST be excluded from list responses and treated as not found on single-record lookups.
- **FR-010**: The API MUST return a health check endpoint (`/health`) that confirms the service and database connection are operational.

### Key Entities

- **Client**: A business customer receiving notifications. Fields: `id` (text, primary key), `name`, `email`, `ga4_property_id` (nullable), `active` (boolean), `settings` (open-ended JSON object), `timezone`, `google_service_account_email` (nullable), `google_service_account_key` (nullable — returned only on single-record lookups, not list responses), `created_at`.
- **Notification Log**: A record of a sent/failed/skipped notification. Fields: `id`, `client_id`, `workflow`, `event_name`, `outcome`, `recipient_email`, `subject`, `resend_id`, `error_message`, `metadata`, `created_at`. Read-only via the API.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: All consuming services can retrieve client records without maintaining a direct database connection.
- **SC-002**: Single-client lookups complete in under 200ms end-to-end under normal load.
- **SC-003**: The API returns a response (success or error) for every request — no hanging connections or silent timeouts.
- **SC-004**: `google_service_account_key` never appears in list responses; it is present only in single-record lookups, verified by automated tests.
- **SC-005**: The notification service can be migrated to consume the API instead of querying the DB directly without changing any notification workflow behavior.
- **SC-006**: Unauthenticated requests are rejected 100% of the time.

---

## Assumptions

- The Postgres database is shared between this API and the notification service during the migration period; the schema is not changed by this feature.
- Authentication is a simple shared API key (passed as a header), not OAuth2 or JWT, given this is an internal service-to-service API.
- The `google_service_account_key` is returned on single-record lookups because consuming services (e.g., the notification service) require it for GA4 queries and Google Sheets writes. It is excluded from list responses since callers fetching the full client list do not need credentials at that stage.
- Client IDs are human-assigned text strings (not auto-generated UUIDs), consistent with the existing `clients` table.
- Notification log endpoints (read-only) are out of scope for this initial feature — the notification service writes logs directly and they are not yet consumed externally.
- The API is deployed as a Cloudflare Worker or Vercel Serverless Function; the runtime environment is determined during planning, not specification.

---

## Out of Scope

- Deleting clients (soft-deactivation via the update endpoint is sufficient)
- Notification log write endpoints (the notification service continues to write logs directly)
- Admin UI
- Pagination beyond a simple `limit` parameter
- Rate limiting (deferred to platform-level controls)
