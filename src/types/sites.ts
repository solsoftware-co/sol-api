export interface SiteFlatResponse {
  id: string;
  clientId: string;
  name: string;
  ga4PropertyId: string | null;
  analyticsRecipients: string[];
  analyticsReportsEnabled: boolean;
  clientTimezone: string;
}

export interface ClientSiteResponse {
  id: string;
  clientId: string;
  name: string;
  description: string | null;
  domain: string | null;
  stagingDomain: string | null;
  ga4PropertyId: string | null;
  analyticsRecipients: string[];
  analyticsReportsEnabled: boolean;
  createdAt: string;
  updatedAt: string;
  googleServiceAccount?: { email: string; key: string };
}
