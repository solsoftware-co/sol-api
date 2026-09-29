// Per-form API keys (SOL-42). A key is `sgk_` + 32 random bytes, base64url:
// the prefix makes keys easy to spot, including for secret scanners. Only
// the SHA-256 is stored — the keys are 256-bit random values, not passwords,
// so a slow KDF (bcrypt/scrypt) would buy nothing and is slow on Workers.
// Sol Gate verifies a key by hashing it the same way (see hashApiKey).

export const API_KEY_PREFIX = "sgk_";

// sgk_ plus 8 random characters: enough to tell a form's keys apart in lists
// and logs, far too little to help guess the rest.
const DISPLAY_PREFIX_LENGTH = API_KEY_PREFIX.length + 8;

export interface GeneratedApiKey {
  key: string;
  keyPrefix: string;
  keyHash: string;
}

export async function generateApiKey(): Promise<GeneratedApiKey> {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const key = API_KEY_PREFIX + base64url(bytes);
  return { key, keyPrefix: key.slice(0, DISPLAY_PREFIX_LENGTH), keyHash: await hashApiKey(key) };
}

/** SHA-256 of the full key, lowercase hex — the form stored in form_api_keys.key_hash. */
export async function hashApiKey(key: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

function base64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
