import { describe, it, expect } from "vitest";
import { createChannelSchema } from "../../../src/validators/channel.js";

const WEBHOOK = "https://hooks.slack.com/services/T000/B000/XXXX";

describe("createChannelSchema", () => {
  it("accepts an email channel", () => {
    const result = createChannelSchema.safeParse({
      type: "email",
      name: "Sales team",
      description: "Inbound leads",
      emailAddresses: ["a@acme.com"],
    });
    expect(result.success).toBe(true);
  });

  it("accepts a Slack channel, with or without a description", () => {
    expect(createChannelSchema.safeParse({ type: "slack", name: "#leads", webhookUrl: WEBHOOK }).success).toBe(true);
    expect(
      createChannelSchema.safeParse({ type: "slack", name: "#leads", description: null, webhookUrl: WEBHOOK }).success
    ).toBe(true);
  });

  it("trims the name and rejects a blank one", () => {
    const trimmed = createChannelSchema.safeParse({ type: "slack", name: "  #leads  ", webhookUrl: WEBHOOK });
    expect(trimmed.success && trimmed.data.name).toBe("#leads");
    expect(createChannelSchema.safeParse({ type: "slack", name: "   ", webhookUrl: WEBHOOK }).success).toBe(false);
  });

  it("rejects an unknown or missing type", () => {
    expect(createChannelSchema.safeParse({ type: "sms", name: "x" }).success).toBe(false);
    expect(createChannelSchema.safeParse({ name: "x", emailAddresses: ["a@acme.com"] }).success).toBe(false);
  });

  it("rejects an email channel with no addresses or an invalid one", () => {
    expect(createChannelSchema.safeParse({ type: "email", name: "x", emailAddresses: [] }).success).toBe(false);
    expect(createChannelSchema.safeParse({ type: "email", name: "x" }).success).toBe(false);
    expect(createChannelSchema.safeParse({ type: "email", name: "x", emailAddresses: ["not-an-email"] }).success).toBe(
      false
    );
  });

  it("rejects a webhook that isn't a Slack incoming webhook", () => {
    expect(
      createChannelSchema.safeParse({ type: "slack", name: "x", webhookUrl: "https://example.com/hook" }).success
    ).toBe(false);
    expect(createChannelSchema.safeParse({ type: "slack", name: "x", webhookUrl: "not a url" }).success).toBe(false);
  });

  it("rejects the other type's fields", () => {
    expect(
      createChannelSchema.safeParse({ type: "email", name: "x", emailAddresses: ["a@acme.com"], webhookUrl: WEBHOOK })
        .success
    ).toBe(false);
    expect(
      createChannelSchema.safeParse({ type: "slack", name: "x", webhookUrl: WEBHOOK, emailAddresses: ["a@acme.com"] })
        .success
    ).toBe(false);
  });
});
