import { describe, it, expect } from "vitest";
import { createNotificationLogSchema } from "../../../src/validators/notification-log.js";

describe("createNotificationLogSchema", () => {
  const valid = {
    clientId: "acme-corp",
    workflow: "weekly-report",
    eventName: "report.sent",
    outcome: "success",
  };

  it("accepts a minimal valid payload, defaulting type to email and metadata to {}", () => {
    const result = createNotificationLogSchema.safeParse(valid);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.type).toBe("email");
      expect(result.data.metadata).toEqual({});
    }
  });

  it("accepts a full email-type payload", () => {
    const result = createNotificationLogSchema.safeParse({
      ...valid,
      type: "email",
      recipientEmail: "client@acme.com",
      subject: "Your weekly report",
      resendId: "re_123",
      errorMessage: null,
      metadata: { attempt: 1 },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.metadata).toEqual({ attempt: 1 });
    }
  });

  it("accepts a full slack-type payload", () => {
    const result = createNotificationLogSchema.safeParse({
      ...valid,
      type: "slack",
      slackWebhookUrl: "https://hooks.slack.com/services/T000/B000/XXXX",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.slackWebhookUrl).toBe("https://hooks.slack.com/services/T000/B000/XXXX");
    }
  });

  it("rejects a missing clientId", () => {
    const { clientId, ...rest } = valid;
    const result = createNotificationLogSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("rejects a missing workflow", () => {
    const { workflow, ...rest } = valid;
    const result = createNotificationLogSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("rejects a missing eventName", () => {
    const { eventName, ...rest } = valid;
    const result = createNotificationLogSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("rejects a missing outcome", () => {
    const { outcome, ...rest } = valid;
    const result = createNotificationLogSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("rejects an empty clientId", () => {
    const result = createNotificationLogSchema.safeParse({ ...valid, clientId: "" });
    expect(result.success).toBe(false);
  });

  it("accepts a null recipientEmail", () => {
    const result = createNotificationLogSchema.safeParse({ ...valid, recipientEmail: null });
    expect(result.success).toBe(true);
  });

  it("rejects a slackWebhookUrl that isn't a valid URL", () => {
    const result = createNotificationLogSchema.safeParse({ ...valid, slackWebhookUrl: "not-a-url" });
    expect(result.success).toBe(false);
  });

  it("accepts a null slackWebhookUrl", () => {
    const result = createNotificationLogSchema.safeParse({ ...valid, slackWebhookUrl: null });
    expect(result.success).toBe(true);
  });
});
