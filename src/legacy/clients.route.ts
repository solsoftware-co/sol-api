// Frozen fork of the /v1/clients contract that sol-notificaiton-service's old
// (Inngest) workflows were built against. /v1/clients is free to be
// redesigned around the new normalized contract; this file intentionally
// does not follow those changes. Retire this file once
// sol-notificaiton-service's old workflows are fully decommissioned.
//
// Fully isolated: imports nothing from repositories/ or services/, and
// nothing outside legacy/ imports from this file.
import { Hono } from "hono";
import { createDb } from "../lib/db.js";
import {
  getClientById,
  listClients,
  insertClient,
  updateClient,
  ConflictError,
  ValidationError,
} from "./clients.repository.js";
import { ErrorCode, type AppEnv } from "../types/index.js";
import { notFoundResponse, validationErrorResponse } from "../lib/responses.js";
import { createClientSchema, updateClientSchema } from "./clients.validator.js";
import { logger } from "../lib/logger.js";

const legacyClients = new Hono<AppEnv>();

legacyClients.get("/", async (c) => {
  const limitParam = c.req.query("limit");
  const limit =
    limitParam !== undefined ? parseInt(limitParam, 10) : undefined;

  if (limit !== undefined && (isNaN(limit) || limit < 1)) {
    return validationErrorResponse(c, "limit must be a positive integer");
  }

  const db = createDb(c.env.DATABASE_URL);
  const rows = await listClients(db, { limit });
  logger.info("listed clients (legacy)", {
    requestId: c.get("requestId"),
    count: rows.length,
    limit,
  });
  return c.json({ success: true, data: rows });
});

legacyClients.get("/:id", async (c) => {
  const db = createDb(c.env.DATABASE_URL);
  const id = c.req.param("id");
  const include = new Set(
    (c.req.query("include") ?? "").split(",").map((v) => v.trim()).filter(Boolean)
  );
  const client = await getClientById(db, id, {
    includeGoogleCredentials: include.has("google_credentials"),
    includeSlackCredentials: include.has("slack_credentials"),
  });

  if (!client) {
    return notFoundResponse(c, `Client not found: ${id}`);
  }

  return c.json({ success: true, data: client });
});

legacyClients.post("/", async (c) => {
  const body = await c.req.json().catch(() => null);
  const result = createClientSchema.safeParse(body);

  if (!result.success) {
    return validationErrorResponse(c, "Validation failed", result.error.issues);
  }

  try {
    const db = createDb(c.env.DATABASE_URL);
    const client = await insertClient(db, result.data);
    logger.info("created client (legacy)", {
      requestId: c.get("requestId"),
      clientId: client.id,
    });
    return c.json({ success: true, data: client }, 201);
  } catch (err) {
    if (err instanceof ConflictError) {
      return c.json(
        {
          success: false,
          error: {
            code: ErrorCode.CONFLICT,
            message: err.message,
            details: null,
          },
        },
        409
      );
    }
    throw err;
  }
});

legacyClients.patch("/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => null);
  const result = updateClientSchema.safeParse(body ?? {});

  if (!result.success) {
    return validationErrorResponse(c, "Validation failed", result.error.issues);
  }

  const db = createDb(c.env.DATABASE_URL);
  let updated;
  try {
    updated = await updateClient(db, id, result.data);
  } catch (err) {
    if (err instanceof ValidationError) {
      return validationErrorResponse(c, err.message);
    }
    throw err;
  }

  if (!updated) {
    return notFoundResponse(c, `Client not found: ${id}`);
  }

  logger.info("updated client (legacy)", {
    requestId: c.get("requestId"),
    clientId: id,
    fields: Object.keys(result.data),
  });
  return c.json({ success: true, data: updated });
});

export default legacyClients;
