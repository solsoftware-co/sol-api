export interface Env {
  DATABASE_URL: string;
  API_KEY: string;
  ENVIRONMENT: string;
  SANITY_API_TOKEN: string;
  GITHUB_TOKEN: string;
}

export enum ErrorCode {
  UNAUTHORIZED = "UNAUTHORIZED",
  NOT_FOUND = "NOT_FOUND",
  VALIDATION_ERROR = "VALIDATION_ERROR",
  CONFLICT = "CONFLICT",
  INTERNAL_ERROR = "INTERNAL_ERROR",
  SERVICE_UNAVAILABLE = "SERVICE_UNAVAILABLE",
}

export type ApiResponse<T> =
  | { success: true; data: T }
  | { success: false; error: { code: ErrorCode; message: string; details?: unknown } };

export type Timezone =
  | "America/New_York"
  | "America/Chicago"
  | "America/Denver"
  | "America/Los_Angeles";

export interface ClientRecord {
  id: string;
  name: string;
  email: string;
  ga4_property_id: string | null;
  active: boolean;
  settings: Record<string, unknown>;
  timezone: string;
  google_service_account_email: string | null;
  google_service_account_key: string | null;
  created_at: string;
  sanity_project_id: string | null;
  sanity_production_dataset: string | null;
  sanity_staging_dataset: string | null;
  github_repo: string | null;
  github_default_branch: string | null;
  github_test_branch: string | null;
  default_email: string | null;
}

export interface NotificationLog {
  id: number;
  client_id: string;
  workflow: string;
  event_name: string;
  outcome: string;
  created_at: string;
  recipient_email: string | null;
  subject: string | null;
  resend_id: string | null;
  error_message: string | null;
  metadata: Record<string, unknown>;
}

export interface ClientSummary {
  id: string;
  name: string;
  email: string;
  ga4_property_id: string | null;
  active: boolean;
  settings: Record<string, unknown>;
  timezone: string;
  google_service_account_email: string | null;
  created_at: string;
  sanity_project_id: string | null;
  sanity_production_dataset: string | null;
  sanity_staging_dataset: string | null;
  github_repo: string | null;
  github_default_branch: string | null;
  github_test_branch: string | null;
  default_email: string | null;
}
