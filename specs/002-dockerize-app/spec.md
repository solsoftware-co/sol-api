# Feature Specification: Docker Local Development Environment

**Feature Branch**: `002-dockerize-app`  
**Created**: 2026-05-03  
**Status**: Draft  
**Input**: User description: "- can you help me dockerize this application so that I can run it with docker"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Start the API with Docker (Priority: P1)

A developer clones the repository on any machine, provides their configuration values in a single place, and starts the API server using a standard Docker command. The API is accessible at a local URL within seconds, without installing any project-specific tooling directly on their machine.

**Why this priority**: This is the core goal — eliminating "works on my machine" problems and reducing onboarding time to near zero. All other scenarios depend on the app running successfully.

**Independent Test**: Can be fully tested by running the Docker start command and making a request to the health endpoint, delivering a running API that responds to HTTP traffic.

**Acceptance Scenarios**:

1. **Given** a developer has Docker installed and has provided the required configuration values, **When** they run the start command, **Then** the API is accessible at `http://localhost:8787/health` within 30 seconds.
2. **Given** the API is running in Docker, **When** a request is made to any authenticated endpoint with a valid API key, **Then** the response is identical to what the API returns when run outside Docker.
3. **Given** the API is running and connected to the database, **When** a client is requested by ID, **Then** the correct client data is returned.

---

### User Story 2 - Run Tests in Docker (Priority: P2)

A developer runs the full test suite inside Docker with a single command. All tests execute within the container and results are printed to the terminal.

**Why this priority**: Ensures CI and local test execution share the same environment, preventing environment-specific test failures.

**Independent Test**: Can be tested by running the Docker test command and verifying all tests pass (or fail consistently with non-Docker runs).

**Acceptance Scenarios**:

1. **Given** the Docker environment is set up, **When** the developer runs the test command via Docker, **Then** the full test suite runs and results are printed to stdout with the same pass/fail outcome as running tests outside Docker.
2. **Given** a test failure exists in the codebase, **When** tests run in Docker, **Then** the failure is reported with the same error message as a non-Docker run.

---

### User Story 3 - Configure the App via Environment Variables (Priority: P3)

A developer provides their database connection string, API key, and environment name through a local configuration file. The app reads these values automatically on start.

**Why this priority**: Secrets must never be baked into the image. Developers need a safe, straightforward way to supply configuration without modifying tracked files.

**Independent Test**: Can be tested by changing the API key value and verifying that authenticated requests are accepted/rejected according to the new value.

**Acceptance Scenarios**:

1. **Given** a developer creates a local secrets file with their configuration values, **When** the app starts in Docker, **Then** the app uses those values without any additional setup steps.
2. **Given** the secrets file is missing or a required value is absent, **When** the app attempts to start, **Then** a clear error message indicates which value is missing.

---

### Edge Cases

- What happens when the database is unreachable at startup? The app should start successfully and return an appropriate error on database-dependent endpoints rather than crashing.
- What happens when the required port (8787) is already in use on the host? The developer receives a clear error and can configure an alternate port.
- What happens when the secrets file contains an invalid database connection string? The app starts but returns a service-unavailable response on database endpoints.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: A developer MUST be able to start the API using a single Docker command with no prior project-specific setup.
- **FR-002**: The running container MUST expose the API on `localhost:8787` by default.
- **FR-003**: The app MUST read its configuration (database URL, API key, environment name) from a local secrets file that is excluded from version control.
- **FR-004**: A developer MUST be able to run the full test suite inside Docker using a single command.
- **FR-005**: The Docker setup MUST support hot-reloading so that source code changes are reflected without restarting the container.
- **FR-006**: The secrets file format MUST match the existing `.dev.vars` format already documented in `CLAUDE.md` so developers have a single configuration convention.
- **FR-007**: The Docker image MUST NOT include secrets or environment-specific values — all configuration is injected at runtime.

### Assumptions

- Developers have Docker Desktop (or Docker Engine + Compose) installed.
- The existing `.dev.vars` file is used as-is for secret injection — no new configuration format is introduced.
- Hot-reload is achieved by mounting the local source directory into the container, not by rebuilding the image on each change.
- The primary use case is local development; production deployment remains on Cloudflare Workers and is out of scope.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A developer with only Docker installed can have the API running and responding to requests in under 5 minutes from a clean clone.
- **SC-002**: All existing tests pass when run via Docker with the same pass/fail result as running them directly on the host.
- **SC-003**: Source code changes are reflected in the running container within 5 seconds without manual intervention.
- **SC-004**: No secrets or credentials appear in any Docker image layer or committed file.
