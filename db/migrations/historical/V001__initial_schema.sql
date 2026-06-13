-- V001__initial_schema.sql
-- Establishes the baseline schema for the notification service.
-- Replaces scripts/setup-db.ts as the authoritative schema definition.
--
-- Uses CREATE TABLE IF NOT EXISTS so this migration is safe to apply
-- against databases that already have these tables (existing dev environments).

CREATE TABLE IF NOT EXISTS clients (
  id              TEXT        PRIMARY KEY,
  name            TEXT        NOT NULL,
  email           TEXT        NOT NULL,
  ga4_property_id TEXT        NULL,
  active          BOOLEAN     NOT NULL DEFAULT TRUE,
  settings        JSONB       NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notification_logs (
  id          BIGSERIAL   PRIMARY KEY,
  client_id   TEXT        NOT NULL REFERENCES clients(id),
  workflow    TEXT        NOT NULL,
  event_name  TEXT        NOT NULL,
  outcome     TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
