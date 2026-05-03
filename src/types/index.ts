export interface Env {
  DATABASE_URL: string;
  API_KEY: string;
  ENVIRONMENT: string;
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
  timezone: Timezone;
  google_service_account_email: string | null;
  google_service_account_key: string | null;
  created_at: string;
}

export interface ClientSummary {
  id: string;
  name: string;
  email: string;
  ga4_property_id: string | null;
  active: boolean;
  settings: Record<string, unknown>;
  timezone: Timezone;
  google_service_account_email: string | null;
  created_at: string;
}
