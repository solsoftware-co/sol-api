import { describe, it, expect } from "vitest";
import { createNotificationLogSchema } from "../../../src/validators/notification-log.js";

describe("createNotificationLogSchema", () => {
  const valid = {
    client_id: "acme-corp",
    workflow: "weekly-report",
    event_name: "report.sent",
    outcome: "success",
  };

  it("accepts a minimal valid payload", () => {
    const result = createNotificationLogSchema.safeParse(valid);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.metadata).toEqual({});
    }
  });

  it("accepts a full valid payload", () => {
    const result = createNotificationLogSchema.safeParse({
      ...valid,
      recipient_email: "client@acme.com",
      subject: "Your weekly report",
      resend_id: "re_123",
      error_message: null,
      metadata: { attempt: 1 },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.metadata).toEqual({ attempt: 1 });
    }
  });

  it("rejects a missing client_id", () => {
    const { client_id, ...rest } = valid;
    const result = createNotificationLogSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("rejects a missing workflow", () => {
    const { workflow, ...rest } = valid;
    const result = createNotificationLogSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("rejects a missing event_name", () => {
    const { event_name, ...rest } = valid;
    const result = createNotificationLogSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("rejects a missing outcome", () => {
    const { outcome, ...rest } = valid;
    const result = createNotificationLogSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("rejects an empty client_id", () => {
    const result = createNotificationLogSchema.safeParse({ ...valid, client_id: "" });
    expect(result.success).toBe(false);
  });

  it("accepts a null recipient_email", () => {
    const result = createNotificationLogSchema.safeParse({ ...valid, recipient_email: null });
    expect(result.success).toBe(true);
  });
});
