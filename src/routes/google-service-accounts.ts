import { Hono } from "hono";
import { createDb } from "../lib/db.js";
import { isUuid } from "../lib/validation.js";
import {
  createGoogleServiceAccount,
  getGoogleServiceAccount,
  ClientNotFoundError,
} from "../services/google-service-accounts.js";
import { notFoundResponse, validationErrorResponse } from "../lib/responses.js";
import { createGoogleServiceAccountSchema } from "../validators/google-service-account.js";
import { logger } from "../lib/logger.js";
import type { AppEnv } from "../types/index.js";

// A client's Google service accounts (SOL-50). The private key is write-only:
// accepted on create, never in a response here, never logged.
const googleServiceAccounts = new Hono<AppEnv>();

googleServiceAccounts.post("/:clientId/google-service-accounts", async (c) => {
  const clientId = c.req.param("clientId");

  const body = await c.req.json().catch(() => null);
  const result = createGoogleServiceAccountSchema.safeParse(body);
  if (!result.success) {
    return validationErrorResponse(c, "Validation failed", result.error.issues);
  }

  try {
    const db = createDb(c.env.DATABASE_URL);
    const created = await createGoogleServiceAccount(db, clientId, result.data);
    logger.info("created google service account", { clientId, googleServiceAccountId: created.id });
    return c.json({ success: true, data: created }, 201);
  } catch (err) {
    if (err instanceof ClientNotFoundError) return notFoundResponse(c, err.message);
    throw err;
  }
});

// Client-scoped like every other by-id lookup: another client's service
// account is a 404, not a hint that it exists.
googleServiceAccounts.get("/:clientId/google-service-accounts/:id", async (c) => {
  const clientId = c.req.param("clientId");
  const id = c.req.param("id");
  const notFound = () => notFoundResponse(c, `Google service account not found: ${id}`);

  if (!isUuid(id)) return notFound();

  const db = createDb(c.env.DATABASE_URL);
  const account = await getGoogleServiceAccount(db, clientId, id);
  if (!account) return notFound();

  return c.json({ success: true, data: account });
});

export default googleServiceAccounts;
