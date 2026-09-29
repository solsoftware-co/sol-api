import { describe, it, expect } from "vitest";
import { generateApiKey, hashApiKey } from "../../../src/lib/api-keys.js";

describe("generateApiKey", () => {
  it("returns sgk_ + 32 random bytes as base64url (43 chars, no padding)", async () => {
    const { key } = await generateApiKey();
    expect(key).toMatch(/^sgk_[A-Za-z0-9_-]{43}$/);
  });

  it("returns a 12-character prefix of the key", async () => {
    const { key, keyPrefix } = await generateApiKey();
    expect(keyPrefix).toHaveLength(12);
    expect(key.startsWith(keyPrefix)).toBe(true);
  });

  it("returns the SHA-256 of the full key as its hash", async () => {
    const { key, keyHash } = await generateApiKey();
    expect(keyHash).toBe(await hashApiKey(key));
  });

  it("never repeats a key", async () => {
    const keys = await Promise.all(Array.from({ length: 50 }, () => generateApiKey()));
    expect(new Set(keys.map((k) => k.key)).size).toBe(50);
  });
});

describe("hashApiKey", () => {
  it("returns lowercase hex SHA-256", async () => {
    // Known vector: SHA-256("abc").
    expect(await hashApiKey("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
});
