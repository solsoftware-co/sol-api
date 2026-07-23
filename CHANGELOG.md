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
