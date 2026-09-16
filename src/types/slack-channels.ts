export interface SlackChannelResponse {
  id: string;
  clientId: string;
  name: string;
  description: string | null;
  webhookUrl: string;
  createdAt: string;
  updatedAt: string;
}
