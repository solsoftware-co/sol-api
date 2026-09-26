-- Wave 3 of the client data model rework (SOL-35, docs/design/data-model.md).
--
-- Hand-assembled from drizzle-kit's output, and wrapped in a single DO block:
-- drizzle's neon-http migrator runs statements one by one with no
-- transaction, so a failure halfway through a multi-statement migration
-- leaves it half-applied and unrecorded. As one statement, this migration
-- applies completely or not at all. Changes from the generated SQL:
--   * slack_channels.channel_id is added nullable, filled, then made NOT NULL
--     (adding it NOT NULL fails on existing rows);
--   * the data copy (Slack channels, default email channels, analytics
--     reports) is done here in SQL rather than a backfill script, because
--     0011 drops the columns it reads and every migration runs first;
--   * UNIQUE (client_id, id) on sites/integrations is created before the
--     composite FKs that reference it (Postgres rejects the reverse);
--   * a closing self-check aborts the whole migration if the copy is
--     incomplete.
DO $$
BEGIN
  CREATE TABLE "analytics_report_channels" (
  	"analytics_report_id" uuid NOT NULL,
  	"channel_id" uuid NOT NULL,
  	"client_id" text NOT NULL,
  	CONSTRAINT "analytics_report_channels_pkey" PRIMARY KEY("analytics_report_id","channel_id")
  );

  CREATE TABLE "analytics_reports" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"client_id" text NOT NULL,
  	"site_id" uuid NOT NULL,
  	"enabled" boolean DEFAULT true NOT NULL,
  	"cron" text NOT NULL,
  	"lookback" text NOT NULL,
  	"last_run_at" timestamp with time zone,
  	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  	CONSTRAINT "analytics_reports_client_id_id_key" UNIQUE("client_id","id"),
  	CONSTRAINT "analytics_reports_lookback_check" CHECK ("analytics_reports"."lookback" IN ('last_week', 'last_month', 'last_7_days', 'last_28_days'))
  );

  CREATE TABLE "channels" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"client_id" text NOT NULL,
  	"type" text NOT NULL,
  	"name" text NOT NULL,
  	"description" text,
  	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  	CONSTRAINT "channels_client_id_id_key" UNIQUE("client_id","id"),
  	CONSTRAINT "channels_id_type_key" UNIQUE("id","type"),
  	CONSTRAINT "channels_client_id_name_key" UNIQUE("client_id","name"),
  	CONSTRAINT "channels_type_check" CHECK ("channels"."type" IN ('email', 'slack'))
  );

  CREATE TABLE "email_groups" (
  	"channel_id" uuid PRIMARY KEY NOT NULL,
  	"channel_type" text DEFAULT 'email' NOT NULL,
  	"email_addresses" text[] NOT NULL,
  	CONSTRAINT "email_groups_channel_type_check" CHECK ("email_groups"."channel_type" = 'email')
  );

  CREATE TABLE "form_channels" (
  	"form_id" uuid NOT NULL,
  	"channel_id" uuid NOT NULL,
  	"client_id" text NOT NULL,
  	"template" text DEFAULT 'form_submission' NOT NULL,
  	"subject" text NOT NULL,
  	"include_fields" text[],
  	CONSTRAINT "form_channels_pkey" PRIMARY KEY("form_id","channel_id")
  );

  CREATE TABLE "form_integrations" (
  	"form_id" uuid NOT NULL,
  	"integration_id" uuid NOT NULL,
  	"client_id" text NOT NULL,
  	"field_mapping" jsonb DEFAULT '{}'::jsonb NOT NULL,
  	CONSTRAINT "form_integrations_pkey" PRIMARY KEY("form_id","integration_id")
  );

  CREATE TABLE "forms" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"client_id" text NOT NULL,
  	"name" text NOT NULL,
  	"description" text,
  	"payload_schema" jsonb DEFAULT '{}'::jsonb NOT NULL,
  	"allowed_origins" text[] DEFAULT '{}' NOT NULL,
  	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  	CONSTRAINT "forms_client_id_id_key" UNIQUE("client_id","id")
  );

  ALTER TABLE "slack_channels" ADD COLUMN "channel_id" uuid;

  ALTER TABLE "slack_channels" ADD COLUMN "channel_type" text DEFAULT 'slack' NOT NULL;

  -- Slack channels: each existing row becomes a channels row (type slack)
  -- carrying its name/description; 0011 then drops those columns from
  -- slack_channels. Channel names are unique per client, so a client's
  -- same-named duplicates get " (2)", " (3)", ...
  UPDATE "slack_channels" SET "channel_id" = gen_random_uuid();

  INSERT INTO "channels" ("id", "client_id", "type", "name", "description", "created_at", "updated_at")
  SELECT
    "channel_id", "client_id", 'slack',
    CASE WHEN "dup" = 1 THEN "name" ELSE "name" || ' (' || "dup" || ')' END,
    "description", "created_at", "updated_at"
  FROM (
    SELECT *, row_number() OVER (PARTITION BY "client_id", "name" ORDER BY "created_at", "id") AS "dup"
    FROM "slack_channels"
  ) AS "s";

  ALTER TABLE "slack_channels" ALTER COLUMN "channel_id" SET NOT NULL;

  -- Every client gets a default email channel holding clients.email (new
  -- clients get one from the create path from now on).
  INSERT INTO "channels" ("client_id", "type", "name")
  SELECT "id", 'email', 'Client email' FROM "clients"
  ON CONFLICT ("client_id", "name") DO NOTHING;

  INSERT INTO "email_groups" ("channel_id", "email_addresses")
  SELECT "c"."id", ARRAY["cl"."email"]
  FROM "channels" "c" JOIN "clients" "cl" ON "cl"."id" = "c"."client_id"
  WHERE "c"."name" = 'Client email' AND "c"."type" = 'email';

  -- Analytics: sites.analytics_recipients becomes an "Analytics: <site>" email
  -- channel; every site gets a report replicating the old weekly Inngest
  -- schedule (Tuesdays 9am client-local, last_week), keeping its enabled flag,
  -- sent to that channel — or, with no recipients, to the client's default
  -- channel (where the old service's recipient fallback ended up).
  INSERT INTO "channels" ("client_id", "type", "name")
  SELECT DISTINCT "client_id", 'email', 'Analytics: ' || "name" FROM "sites"
  WHERE cardinality("analytics_recipients") > 0
  ON CONFLICT ("client_id", "name") DO NOTHING;

  INSERT INTO "email_groups" ("channel_id", "email_addresses")
  SELECT DISTINCT ON ("c"."id") "c"."id", "s"."analytics_recipients"
  FROM "sites" "s"
  JOIN "channels" "c" ON "c"."client_id" = "s"."client_id" AND "c"."type" = 'email' AND "c"."name" = 'Analytics: ' || "s"."name"
  WHERE cardinality("s"."analytics_recipients") > 0
  ORDER BY "c"."id", "s"."created_at"
  ON CONFLICT ("channel_id") DO NOTHING;

  INSERT INTO "analytics_reports" ("client_id", "site_id", "enabled", "cron", "lookback")
  SELECT "client_id", "id", "analytics_reports_enabled", '0 9 * * 2', 'last_week' FROM "sites";

  INSERT INTO "analytics_report_channels" ("analytics_report_id", "channel_id", "client_id")
  SELECT "r"."id", "c"."id", "r"."client_id"
  FROM "analytics_reports" "r"
  JOIN "sites" "s" ON "s"."id" = "r"."site_id"
  JOIN "channels" "c" ON "c"."client_id" = "r"."client_id" AND "c"."type" = 'email'
    AND "c"."name" = CASE WHEN cardinality("s"."analytics_recipients") > 0 THEN 'Analytics: ' || "s"."name" ELSE 'Client email' END;

  -- (client_id, id) must be UNIQUE before any composite FK references it.
  ALTER TABLE "integrations" ADD CONSTRAINT "integrations_client_id_id_key" UNIQUE("client_id","id");

  ALTER TABLE "sites" ADD CONSTRAINT "sites_client_id_id_key" UNIQUE("client_id","id");

  ALTER TABLE "analytics_report_channels" ADD CONSTRAINT "analytics_report_channels_client_id_analytics_report_id_fkey" FOREIGN KEY ("client_id","analytics_report_id") REFERENCES "public"."analytics_reports"("client_id","id") ON DELETE no action ON UPDATE no action;

  ALTER TABLE "analytics_report_channels" ADD CONSTRAINT "analytics_report_channels_client_id_channel_id_fkey" FOREIGN KEY ("client_id","channel_id") REFERENCES "public"."channels"("client_id","id") ON DELETE no action ON UPDATE no action;

  ALTER TABLE "analytics_reports" ADD CONSTRAINT "analytics_reports_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;

  ALTER TABLE "analytics_reports" ADD CONSTRAINT "analytics_reports_client_id_site_id_fkey" FOREIGN KEY ("client_id","site_id") REFERENCES "public"."sites"("client_id","id") ON DELETE no action ON UPDATE no action;

  ALTER TABLE "channels" ADD CONSTRAINT "channels_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;

  ALTER TABLE "email_groups" ADD CONSTRAINT "email_groups_channel_id_channel_type_fkey" FOREIGN KEY ("channel_id","channel_type") REFERENCES "public"."channels"("id","type") ON DELETE no action ON UPDATE no action;

  ALTER TABLE "form_channels" ADD CONSTRAINT "form_channels_client_id_form_id_fkey" FOREIGN KEY ("client_id","form_id") REFERENCES "public"."forms"("client_id","id") ON DELETE no action ON UPDATE no action;

  ALTER TABLE "form_channels" ADD CONSTRAINT "form_channels_client_id_channel_id_fkey" FOREIGN KEY ("client_id","channel_id") REFERENCES "public"."channels"("client_id","id") ON DELETE no action ON UPDATE no action;

  ALTER TABLE "form_integrations" ADD CONSTRAINT "form_integrations_client_id_form_id_fkey" FOREIGN KEY ("client_id","form_id") REFERENCES "public"."forms"("client_id","id") ON DELETE no action ON UPDATE no action;

  ALTER TABLE "form_integrations" ADD CONSTRAINT "form_integrations_client_id_integration_id_fkey" FOREIGN KEY ("client_id","integration_id") REFERENCES "public"."integrations"("client_id","id") ON DELETE no action ON UPDATE no action;

  ALTER TABLE "forms" ADD CONSTRAINT "forms_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;

  ALTER TABLE "slack_channels" ADD CONSTRAINT "slack_channels_channel_id_channel_type_fkey" FOREIGN KEY ("channel_id","channel_type") REFERENCES "public"."channels"("id","type") ON DELETE no action ON UPDATE no action;

  ALTER TABLE "slack_channels" ADD CONSTRAINT "slack_channels_channel_id_key" UNIQUE("channel_id");

  ALTER TABLE "slack_channels" ADD CONSTRAINT "slack_channels_channel_type_check" CHECK ("slack_channels"."channel_type" = 'slack');

  -- Self-check: abort (rolling everything back) if the copy is incomplete.
  IF EXISTS (
    SELECT 1 FROM "clients" "cl" WHERE NOT EXISTS (
      SELECT 1 FROM "channels" "c" JOIN "email_groups" "g" ON "g"."channel_id" = "c"."id"
      WHERE "c"."client_id" = "cl"."id" AND "c"."name" = 'Client email'
    )
  ) THEN
    RAISE EXCEPTION 'SOL-35: a client has no "Client email" email channel (is a Slack channel already named "Client email"?)';
  END IF;
  IF EXISTS (
    SELECT 1 FROM "sites" "s" WHERE NOT EXISTS (
      SELECT 1 FROM "analytics_reports" "r" JOIN "analytics_report_channels" "l" ON "l"."analytics_report_id" = "r"."id"
      WHERE "r"."site_id" = "s"."id"
    )
  ) THEN
    RAISE EXCEPTION 'SOL-35: a site has no analytics report linked to a channel';
  END IF;
END
$$;
