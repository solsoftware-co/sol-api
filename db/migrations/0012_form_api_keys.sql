-- SOL-42: per-form API keys for Sol Gate (docs/design/data-model.md).
-- drizzle-kit's output, wrapped in one DO block so it applies atomically
-- (see 0010's header — the neon-http migrator runs no transaction).
DO $$
BEGIN
  CREATE TABLE "form_api_keys" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"client_id" text NOT NULL,
  	"form_id" uuid NOT NULL,
  	"name" text NOT NULL,
  	"key_prefix" text NOT NULL,
  	"key_hash" text NOT NULL,
  	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
  	"revoked_at" timestamp with time zone,
  	"expires_at" timestamp with time zone,
  	CONSTRAINT "form_api_keys_key_hash_key" UNIQUE("key_hash")
  );

  ALTER TABLE "form_api_keys" ADD CONSTRAINT "form_api_keys_client_id_form_id_fkey" FOREIGN KEY ("client_id","form_id") REFERENCES "public"."forms"("client_id","id") ON DELETE no action ON UPDATE no action;

  CREATE INDEX "form_api_keys_client_id_form_id_idx" ON "form_api_keys" USING btree ("client_id","form_id");
END
$$;
