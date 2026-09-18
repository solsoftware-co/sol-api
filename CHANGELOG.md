# [1.18.0](https://github.com/solsoftware-co/sol-api/compare/v1.17.0...v1.18.0) (2026-09-18)


### Features

* convert /v1/notification-logs to camelCase (SOL-7 PR4) ([8a03ebb](https://github.com/solsoftware-co/sol-api/commit/8a03ebb3dc90e72e96418e4d8fe4d10d8e034157))

# [1.17.0](https://github.com/solsoftware-co/sol-api/compare/v1.16.0...v1.17.0) (2026-09-18)


### Bug Fixes

* type snakeToCamelKeys() output from its input instead of Record<string, unknown> (SOL-7) ([9e44054](https://github.com/solsoftware-co/sol-api/commit/9e4405415408cce29196c4b677b2e856dbf3a5c7))


### Features

* isolate frozen client + notification-log contracts into legacy/ (SOL-7) ([972a527](https://github.com/solsoftware-co/sol-api/commit/972a52712c273194bd9294c2b5bf10585ae00e68))
* rebuild /v1/clients + add slack-channels/integrations/sites routes (SOL-7) ([ab64b9a](https://github.com/solsoftware-co/sol-api/commit/ab64b9a9d59d50b6f9c1d3ba277b00765dd6fc4d))

# [1.16.0](https://github.com/solsoftware-co/sol-api/compare/v1.15.0...v1.16.0) (2026-09-16)


### Features

* add type/slack_webhook_url columns to notification_logs (SOL-7) ([6bb72f1](https://github.com/solsoftware-co/sol-api/commit/6bb72f1febb82409d05bc1465f8957790153ddd9))

# [1.15.0](https://github.com/solsoftware-co/sol-api/compare/v1.14.0...v1.15.0) (2026-09-15)


### Features

* drop legacy clients.ga4_property_id/sanity_*/github_* columns ([632da3f](https://github.com/solsoftware-co/sol-api/commit/632da3f77f64e94bc29423786b7a88954816051a)), closes [#24](https://github.com/solsoftware-co/sol-api/issues/24)

# [1.14.0](https://github.com/solsoftware-co/sol-api/compare/v1.13.0...v1.14.0) (2026-09-14)


### Features

* cut over /v1/clients ga4/sanity/github reads+writes to SITE (SOL-22) ([be99ac2](https://github.com/solsoftware-co/sol-api/commit/be99ac2a7ab430fed451ab55fd5a6a497173f173))

# [1.13.0](https://github.com/solsoftware-co/sol-api/compare/v1.12.1...v1.13.0) (2026-09-14)


### Features

* provision Wave 2 site infrastructure tables (SOL-6) ([925b085](https://github.com/solsoftware-co/sol-api/commit/925b08562f72bc076a4dd6aebc12ffa1d15759ac))

## [1.12.1](https://github.com/solsoftware-co/sol-api/compare/v1.12.0...v1.12.1) (2026-09-14)


### Bug Fixes

* rename google_drive_integrations to google_sheets_integrations ([430bf44](https://github.com/solsoftware-co/sol-api/commit/430bf44f76379136d876a491266b41e3a3bda88a))

# [1.12.0](https://github.com/solsoftware-co/sol-api/compare/v1.11.0...v1.12.0) (2026-09-14)


### Features

* add frozen /legacy/clients fork ([1b2e556](https://github.com/solsoftware-co/sol-api/commit/1b2e5568943032da9edc51c5ce88a0d013c68c6c))

# [1.11.0](https://github.com/solsoftware-co/sol-api/compare/v1.10.0...v1.11.0) (2026-09-10)


### Features

* drop legacy client columns, remove temporary backfill CI step ([2464786](https://github.com/solsoftware-co/sol-api/commit/2464786117edeefe4f67fe3eb5b9f820825d6f12)), closes [#19](https://github.com/solsoftware-co/sol-api/issues/19)

# [1.10.0](https://github.com/solsoftware-co/sol-api/compare/v1.9.0...v1.10.0) (2026-09-10)


### Features

* cut over reads/writes to google_service_accounts/slack_channels ([6fcb5c2](https://github.com/solsoftware-co/sol-api/commit/6fcb5c237c89f226b0d115872f534c2d96be1273))

# [1.9.0](https://github.com/solsoftware-co/sol-api/compare/v1.8.0...v1.9.0) (2026-09-10)


### Bug Fixes

* correct CLIENT.id and its FKs from uuid to text in ERD ([d8edccf](https://github.com/solsoftware-co/sol-api/commit/d8edccf4de0e84888caea8fa115903694fa70ea0))
* correct invalid Mermaid key syntax in ERD ([7081694](https://github.com/solsoftware-co/sol-api/commit/7081694ca328bc5f20e52d3ae6815df4b823ec62))
* run the integrations backfill against PR branches too ([e6656da](https://github.com/solsoftware-co/sol-api/commit/e6656dafc4b14b8a61df207fcc221ed0d330e7c2))


### Features

* add idempotent backfill+reconcile script and wire it into CI ([973764e](https://github.com/solsoftware-co/sol-api/commit/973764e44e326593896d74d5c011f73986318185))
* add Wave 1 integration/notification-channel tables, drop default_email ([0cf8c0a](https://github.com/solsoftware-co/sol-api/commit/0cf8c0ad61e5e8c92c1c9b6d168fae3d00c8eb01))

# [1.8.0](https://github.com/solsoftware-co/sol-api/compare/v1.7.1...v1.8.0) (2026-08-16)


### Bug Fixes

* migrate staging before running tests in release pipeline ([a20e174](https://github.com/solsoftware-co/sol-api/commit/a20e1748fc5c8a3dc701db2727735423be115d55))


### Features

* add slack_webhook_url client column, gated like Google credentials ([0c3026f](https://github.com/solsoftware-co/sol-api/commit/0c3026f99a646c14d623c1d6b08210a85f7ca238))

## [1.7.1](https://github.com/solsoftware-co/sol-api/compare/v1.7.0...v1.7.1) (2026-08-16)


### Bug Fixes

* rename credential include param to google_credentials ([c016fe6](https://github.com/solsoftware-co/sol-api/commit/c016fe6380f7634769f10fd83e3ec27331c0f730))

# [1.7.0](https://github.com/solsoftware-co/sol-api/compare/v1.6.0...v1.7.0) (2026-08-16)


### Features

* exclude google_service_account_key from GET /v1/clients/:id by default ([e20b37d](https://github.com/solsoftware-co/sol-api/commit/e20b37d43d5248a2e95ff4128f0e9167548069c1))

# [1.6.0](https://github.com/solsoftware-co/sol-api/compare/v1.5.1...v1.6.0) (2026-07-28)


### Features

* add structured logging, request tracing, and Workers Logs ([fbb1d59](https://github.com/solsoftware-co/sol-api/commit/fbb1d59ed88e829ea81a71c0d296ee54a596a367))
* enrich request logs with context and add business-event logging ([19fa714](https://github.com/solsoftware-co/sol-api/commit/19fa714f8ac3137f7591f60aea8f749448abc3cf))

## [1.5.1](https://github.com/solsoftware-co/sol-api/compare/v1.5.0...v1.5.1) (2026-07-23)


### Bug Fixes

* poll for Worker reachability instead of a fixed 30s sleep ([868dde0](https://github.com/solsoftware-co/sol-api/commit/868dde09df3e38e718aceb94de336efd87ab9a4e))

# [1.5.0](https://github.com/solsoftware-co/sol-api/compare/v1.4.1...v1.5.0) (2026-07-23)


### Bug Fixes

* merge PR workflow jobs to keep Neon branch URL in one job ([af0d092](https://github.com/solsoftware-co/sol-api/commit/af0d0926614c70a60c9b503e848be6bc65cdc6c0))
* run integration tests for real and fix duplicate-ID 500 ([32eb8a4](https://github.com/solsoftware-co/sol-api/commit/32eb8a420d27569a26a225c2443ce9ec08c3991b))


### Features

* add persistent staging environment with production approval gate ([f509643](https://github.com/solsoftware-co/sol-api/commit/f50964356eab7b693b398f099efcf7638c619b18))

## [1.4.1](https://github.com/solsoftware-co/sol-api/compare/v1.4.0...v1.4.1) (2026-07-21)


### Bug Fixes

* apply migrations to production before deploy on release ([1c0f128](https://github.com/solsoftware-co/sol-api/commit/1c0f128d989d028a4cf4c7cc048ffe92024b60ee))

# [1.4.0](https://github.com/solsoftware-co/sol-api/compare/v1.3.0...v1.4.0) (2026-07-21)


### Features

* add default_email column to clients table ([dd4cb35](https://github.com/solsoftware-co/sol-api/commit/dd4cb35ac8a58499c125ebace49840d5979735f6))

# [1.3.0](https://github.com/solsoftware-co/sol-api/compare/v1.2.0...v1.3.0) (2026-07-15)


### Features

* add notification-logs endpoint ([9fd3135](https://github.com/solsoftware-co/sol-api/commit/9fd3135debf768308434a1af47071671321a6366))

# [1.2.0](https://github.com/solsoftware-co/sol-api/compare/v1.1.0...v1.2.0) (2026-06-19)


### Bug Fixes

* cast res.json() to any in tests to satisfy tsc strict unknown check ([597d746](https://github.com/solsoftware-co/sol-api/commit/597d746f67d30e18a62d5c4b2d9aab5f2c96cfcd))
* correct drizzle/neon compatibility and migration baseline ([455ab25](https://github.com/solsoftware-co/sol-api/commit/455ab25db47bad74e616abe88a4c9eaa119fcd8b))


### Features

* add Drizzle ORM and Sanity/GitHub integration fields to clients ([60d9e3d](https://github.com/solsoftware-co/sol-api/commit/60d9e3dabfb9d046c2ed0cc104bc7b405ab277ca))
* added husky pre-push check ([e740a93](https://github.com/solsoftware-co/sol-api/commit/e740a93c4570a57e70b55941a78581f362640456))

# [1.1.0](https://github.com/solsoftware-co/sol-api/compare/v1.0.0...v1.1.0) (2026-06-08)


### Features

* add Bruno API collection for all endpoints ([1c23571](https://github.com/solsoftware-co/sol-api/commit/1c23571ed0a7eee8410e4ff47fe4a4f705df32db))

# 1.0.0 (2026-06-08)


### Bug Fixes

* correct --bail flag and wrangler --name/--env conflict in CI workflows ([671e425](https://github.com/solsoftware-co/sol-api/commit/671e425bf90cb1f503fbf9e24d4e2bf7c8753bf8))
* correct health assertion and API_KEY env var name in e2e tests ([eeb73f1](https://github.com/solsoftware-co/sol-api/commit/eeb73f1f1c20bb7396937c11d9156037507b18ee))
* use RELEASE_TOKEN PAT for semantic-release to bypass branch protection ([4115557](https://github.com/solsoftware-co/sol-api/commit/411555746eaf56370f5a3091c397138abde80aba))


### Features

* dockerize app for local development (002) ([72a9d52](https://github.com/solsoftware-co/sol-api/commit/72a9d52f816f8e2f5f9f14c8ef84a5446b5f350f))
