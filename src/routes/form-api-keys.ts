import { Hono } from "hono";
import { createDb } from "../lib/db.js";
import { isUuid } from "../lib/validation.js";
import {
  createFormApiKey,
  listFormApiKeys,
  revokeFormApiKey,
  verifyFormApiKey,
  FormNotFoundError,
} from "../services/form-api-keys.js";
import { notFoundResponse, validationErrorResponse } from "../lib/responses.js";
import { createFormApiKeySchema, verifyFormApiKeySchema } from "../validators/form-api-key.js";
import { logger } from "../lib/logger.js";
import { API_KEY_PREFIX } from "../lib/api-keys.js";
import type { AppEnv } from "../types/index.js";

// Per-form API keys (SOL-42). Client-scoped like the form lookup: a form under
// the wrong client is a 404. The plaintext key only ever appears in the create
// response, and is never logged; no response ever contains a key's hash.
const formApiKeys = new Hono<AppEnv>();

formApiKeys.post("/:clientId/forms/:formId/api-keys", async (c) => {
  const clientId = c.req.param("clientId");
  const formId = c.req.param("formId");
  if (!isUuid(formId)) return notFoundResponse(c, `Form not found: ${formId}`);

  const body = await c.req.json().catch(() => null);
  const result = createFormApiKeySchema.safeParse(body);
  if (!result.success) {
    return validationErrorResponse(c, "Validation failed", result.error.issues);
  }

  try {
    const db = createDb(c.env.DATABASE_URL);
    const created = await createFormApiKey(db, clientId, formId, result.data);
    logger.info("created form api key", {
      clientId,
      formId,
      keyId: created.id,
      keyPrefix: created.keyPrefix,
    });
    return c.json({ success: true, data: created }, 201);
  } catch (err) {
    if (err instanceof FormNotFoundError) return notFoundResponse(c, err.message);
    throw err;
  }
});

formApiKeys.get("/:clientId/forms/:formId/api-keys", async (c) => {
  const clientId = c.req.param("clientId");
  const formId = c.req.param("formId");
  const notFound = () => notFoundResponse(c, `Form not found: ${formId}`);
  if (!isUuid(formId)) return notFound();

  const db = createDb(c.env.DATABASE_URL);
  const keys = await listFormApiKeys(db, clientId, formId);
  if (!keys) return notFound();

  return c.json({ success: true, data: keys });
});

// Sol Gate's check of a caller's key. The key goes in the body (never the URL,
// which ends up in request logs). A wrong key is a 200 with
// authenticated: false, not a 401 — a 401 here already means sol-api's own
// X-API-Key was rejected, and Sol Gate must be able to tell the two apart.
formApiKeys.post("/:clientId/forms/:formId/api-keys/verify", async (c) => {
  const clientId = c.req.param("clientId");
  const formId = c.req.param("formId");

  const body = await c.req.json().catch(() => null);
  const result = verifyFormApiKeySchema.safeParse(body);
  if (!result.success) {
    return validationErrorResponse(c, "Validation failed", result.error.issues);
  }

  // Cheap rejections before touching the database. Not a 404: an unknown form
  // is just "not authenticated".
  if (!isUuid(formId) || !result.data.key.startsWith(API_KEY_PREFIX)) {
    return c.json({ success: true, data: { authenticated: false } });
  }

  const db = createDb(c.env.DATABASE_URL);
  const verified = await verifyFormApiKey(db, clientId, formId, result.data.key);
  logger.info("verified form api key", {
    clientId,
    formId,
    authenticated: verified.authenticated,
    keyId: verified.authenticated ? verified.keyId : undefined,
  });
  return c.json({ success: true, data: verified });
});

formApiKeys.delete("/:clientId/forms/:formId/api-keys/:keyId", async (c) => {
  const clientId = c.req.param("clientId");
  const formId = c.req.param("formId");
  const keyId = c.req.param("keyId");
  const notFound = () => notFoundResponse(c, `API key not found: ${keyId}`);
  if (!isUuid(formId) || !isUuid(keyId)) return notFound();

  const db = createDb(c.env.DATABASE_URL);
  const revoked = await revokeFormApiKey(db, clientId, formId, keyId);
  if (!revoked) return notFound();

  logger.info("revoked form api key", { clientId, formId, keyId });
  return c.body(null, 204);
});

export default formApiKeys;
