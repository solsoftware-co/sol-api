ALTER TABLE "notification_logs" ADD COLUMN "type" text DEFAULT 'email' NOT NULL;--> statement-breakpoint
ALTER TABLE "notification_logs" ADD COLUMN "slack_webhook_url" text;