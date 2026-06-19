# Feature Specification: Drizzle ORM + Client Integration Fields

**Feature Branch**: `feat/005-drizzle-client`
**Created**: 2026-06-08
**Status**: Draft
**Input**: User description: "Add Drizzle ORM and expand the Client entity with Sanity and GitHub integration fields to support an email-triggered agent workflow."

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Client record stores Sanity and GitHub integration config (Priority: P1)

When an agent workflow is triggered by a client email, it needs to know which Sanity project and GitHub repository belong to that client — including which datasets and branches to target for production vs. staging changes. A developer configuring a new client can store all integration config in one place via the existing API.

**Why this priority**: Without these fields, the agent workflow cannot route actions to the correct Sanity project or GitHub repo. This is the core data requirement for the entire workflow.

**Independent Test**: Create a client record with all new integration fields via `POST /v1/clients`, retrieve it via `GET /v1/clients/:id`, and confirm all fields are returned correctly.

**Acceptance Scenarios**:

1. **Given** a valid API request, **When** a client is created with `sanity_project_id`, `sanity_production_dataset`, `sanity_staging_dataset`, `github_repo`, `github_default_branch`, and `github_test_branch`, **Then** all fields are persisted and returned on `GET /v1/clients/:id`
2. **Given** a client with integration fields, **When** a `PATCH` request updates `github_default_branch`, **Then** only that field changes and all others remain unchanged
3. **Given** a client creation request, **When** integration fields are omitted, **Then** the client is created successfully with those fields as null
4. **Given** a `GET /v1/clients` list request, **Then** all new integration fields are included in the response (none are sensitive)

---

### User Story 2 — Database schema can be evolved safely through versioned migrations (Priority: P2)

A developer can add, modify, or remove database columns over time using a managed migration workflow — with a clear history of every schema change, the ability to run migrations in CI, and confidence that no data is lost.

**Why this priority**: Adding the new client fields requires a schema change. Without a migration workflow, schema changes are manual, error-prone, and leave no audit trail. This story is foundational for all future schema evolution.

**Independent Test**: Run the migration against a clean database and confirm the new columns exist. Roll back and confirm they are removed. Run against a database with existing client records and confirm no data is lost.

**Acceptance Scenarios**:

1. **Given** an existing `clients` table with data, **When** the migration runs, **Then** all existing records are preserved and the new columns are added as nullable
2. **Given** the migration has been applied, **When** a client is created with new fields, **Then** the data is persisted correctly
3. **Given** the migration history, **Then** every schema change has a corresponding versioned migration file that can be replayed in order

---

### User Story 3 — All existing client endpoints continue to work correctly (Priority: P3)

All existing endpoint behaviour — response shapes, validation rules, error codes, authentication — must remain identical after the data layer migration. No breaking changes to the API contract.

**Why this priority**: Existing integrations (the notification service, deployed agents) depend on stable endpoint behaviour. This is a correctness requirement that must hold throughout.

**Independent Test**: Run the full existing integration test suite against the updated implementation and confirm all tests pass without modification.

**Acceptance Scenarios**:

1. **Given** the updated implementation, **When** the full test suite runs, **Then** all existing tests pass without modification
2. **Given** a `GET /v1/clients` request, **Then** response shape matches the existing envelope: `{ success: true, data: [...] }`
3. **Given** an invalid payload to `POST /v1/clients`, **Then** a `400` with `VALIDATION_ERROR` is returned
4. **Given** a request without `X-API-Key`, **Then** a `401` with `UNAUTHORIZED` is returned

---

### Edge Cases

- What happens when `github_repo` is set but `github_default_branch` is omitted? → Default to `main`
- What happens when a client is updated to clear a field (set to `null`)? → Field is nulled, no error
- What happens when `sanity_production_dataset` and `sanity_staging_dataset` are the same value? → Allowed, no validation error
- What happens when the migration has not been run? → API fails with `SERVICE_UNAVAILABLE`, not a cryptic database error

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The `clients` table MUST have the following new nullable fields: `sanity_project_id`, `sanity_production_dataset`, `sanity_staging_dataset`, `github_repo`, `github_default_branch`, `github_test_branch`
- **FR-002**: `github_default_branch` MUST default to `main` when not provided on create
- **FR-003**: All new fields MUST be settable via `POST /v1/clients` and updatable via `PATCH /v1/clients/:id`
- **FR-004**: All new fields MUST be nullable — no existing client records are invalidated by the migration
- **FR-005**: The existing `google_service_account_key` exclusion rule on list responses MUST continue to apply
- **FR-006**: A database migration MUST be provided that adds the new columns to the existing `clients` table without data loss
- **FR-007**: All CRUD operations MUST produce identical response shapes and error codes as the current implementation
- **FR-008**: Every schema change MUST have a corresponding versioned migration file committed to the repository
- **FR-009**: Credentials for Sanity and GitHub are NOT stored per-client in the database — they are stored as worker environment secrets shared across all clients

### Key Entities

- **Client**: Represents a business client. Extended with Sanity CMS integration config (`sanity_project_id`, `sanity_production_dataset`, `sanity_staging_dataset`) and GitHub integration config (`github_repo`, `github_default_branch`, `github_test_branch`). No per-client secrets — the agent uses shared credentials from the worker environment.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: All existing integration tests pass without modification after the migration
- **SC-002**: A client record with all new fields set can be created, retrieved, and updated via the API
- **SC-003**: The database migration completes without data loss on the existing `clients` table
- **SC-004**: No breaking changes to any existing endpoint — response shapes, status codes, and error codes are identical before and after
- **SC-005**: Every schema change in this feature has a corresponding versioned migration file that can be replayed independently

## Assumptions

- The `clients` table already exists in the Neon database (created by `sol-notification-service`)
- All new fields are optional; the migration adds nullable columns with no backfill required
- `github_default_branch` defaults to `main` when not provided; `github_test_branch` has no default and is nullable
- Sanity and GitHub credentials (`SANITY_API_TOKEN`, `GITHUB_TOKEN`) are stored as Cloudflare Worker secrets — not per-client database fields
- A single shared Sanity token has access to all client Sanity projects; a single shared GitHub token (or GitHub App) has access to all client repos
