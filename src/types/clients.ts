export interface ClientMinimalResponse {
  id: string;
  name: string;
  email: string;
  active: boolean;
  settings: Record<string, unknown>;
  timezone: string;
  createdAt: string;
}
