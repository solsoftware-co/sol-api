import { describe, it, expect } from "vitest";
import {
  createFormSchema,
  updateFormSchema,
  putFormIntegrationSchema,
  putFormChannelSchema,
} from "../../../src/validators/form.js";

const I1 = "11111111-1111-4111-8111-111111111111";
const I2 = "22222222-2222-4222-8222-222222222222";
const C1 = "33333333-3333-4333-8333-333333333333";
const base = { name: "Newsletter", payloadSchema: { type: "object" } };

describe("createFormSchema", () => {
  it("accepts a form with no links, defaulting both to empty", () => {
    const result = createFormSchema.safeParse(base);
    expect(result.success && result.data).toMatchObject({ integrations: [], channels: [] });
  });

  it("accepts links, defaulting fieldMapping and integrationIds", () => {
    const result = createFormSchema.safeParse({
      ...base,
      integrations: [{ integrationId: I1 }],
      channels: [{ channelId: C1, subject: "New sign-up" }],
    });
    expect(result.success && result.data.integrations[0].fieldMapping).toEqual({});
    expect(result.success && result.data.channels[0].integrationIds).toEqual([]);
  });

  it("lowercases ids so later comparisons match Postgres", () => {
    const result = createFormSchema.safeParse({
      ...base,
      integrations: [{ integrationId: I1.toUpperCase() }],
      channels: [{ channelId: C1.toUpperCase(), integrationIds: [I1.toUpperCase()] }],
    });
    expect(result.success).toBe(true);
    expect(result.success && result.data.integrations[0].integrationId).toBe(I1);
    expect(result.success && result.data.channels[0].integrationIds).toEqual([I1]);
  });

  it("requires a notification's integrationIds to be integrations the form runs", () => {
    const result = createFormSchema.safeParse({
      ...base,
      integrations: [{ integrationId: I1 }],
      channels: [{ channelId: C1, integrationIds: [I1, I2] }],
    });
    expect(result.success).toBe(false);
    expect(!result.success && result.error.issues[0].path).toEqual(["channels", 0, "integrationIds"]);
  });

  it("rejects an integration, channel, or report listed twice", () => {
    expect(
      createFormSchema.safeParse({ ...base, integrations: [{ integrationId: I1 }, { integrationId: I1.toUpperCase() }] })
        .success
    ).toBe(false);
    expect(createFormSchema.safeParse({ ...base, channels: [{ channelId: C1 }, { channelId: C1 }] }).success).toBe(false);
    expect(
      createFormSchema.safeParse({
        ...base,
        integrations: [{ integrationId: I1 }],
        channels: [{ channelId: C1, integrationIds: [I1, I1] }],
      }).success
    ).toBe(false);
  });

  it("requires a name and a payloadSchema object", () => {
    expect(createFormSchema.safeParse({ payloadSchema: {} }).success).toBe(false);
    expect(createFormSchema.safeParse({ name: "x" }).success).toBe(false);
    expect(createFormSchema.safeParse({ name: "x", payloadSchema: "not an object" }).success).toBe(false);
  });

  it("rejects allowedOrigins and other unknown fields", () => {
    expect(createFormSchema.safeParse({ ...base, allowedOrigins: ["https://acme.com"] }).success).toBe(false);
    expect(
      createFormSchema.safeParse({ ...base, integrations: [{ integrationId: I1, name: "x" }] }).success
    ).toBe(false);
  });

  it("rejects a non-UUID id", () => {
    expect(createFormSchema.safeParse({ ...base, integrations: [{ integrationId: "nope" }] }).success).toBe(false);
  });
});

describe("updateFormSchema", () => {
  it("accepts any subset of the form's own fields", () => {
    expect(updateFormSchema.safeParse({ name: "Renamed" }).success).toBe(true);
    expect(updateFormSchema.safeParse({ description: null }).success).toBe(true);
    expect(updateFormSchema.safeParse({ payloadSchema: {} }).success).toBe(true);
  });

  it("rejects an empty patch and link fields", () => {
    expect(updateFormSchema.safeParse({}).success).toBe(false);
    expect(updateFormSchema.safeParse({ integrations: [] }).success).toBe(false);
  });
});

describe("link schemas", () => {
  it("defaults an integration link's fieldMapping", () => {
    const result = putFormIntegrationSchema.safeParse({});
    expect(result.success && result.data.fieldMapping).toEqual({});
  });

  it("accepts channel settings and rejects a repeated integration", () => {
    expect(putFormChannelSchema.safeParse({ subject: "Hi", integrationIds: [I1] }).success).toBe(true);
    expect(putFormChannelSchema.safeParse({ integrationIds: [I1, I1] }).success).toBe(false);
    expect(putFormChannelSchema.safeParse({ channelId: C1 }).success).toBe(false);
  });
});
