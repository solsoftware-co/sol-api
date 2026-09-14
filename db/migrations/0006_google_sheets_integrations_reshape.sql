DROP TABLE "google_drive_integrations";--> statement-breakpoint
CREATE TABLE "google_sheets_integrations" (
	"integration_id" uuid PRIMARY KEY NOT NULL,
	"google_service_account_id" uuid NOT NULL,
	"spreadsheet_id" text NOT NULL,
	"sheet_name" text,
	"column_mapping" text[] NOT NULL,
	"table_anchor" text DEFAULT 'A1'
);
--> statement-breakpoint
ALTER TABLE "google_sheets_integrations" ADD CONSTRAINT "google_sheets_integrations_integration_id_fkey" FOREIGN KEY ("integration_id") REFERENCES "public"."integrations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "google_sheets_integrations" ADD CONSTRAINT "google_sheets_integrations_google_service_account_id_fkey" FOREIGN KEY ("google_service_account_id") REFERENCES "public"."google_service_accounts"("id") ON DELETE no action ON UPDATE no action;
