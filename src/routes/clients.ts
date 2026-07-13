import { Hono } from "hono";
import {
  createDb,
  getClientById,
  listClients,
  insertClient,
  updateClient,
  ConflictError,
} from "../lib/db.js";
import { ErrorCode, type Env } from "../types/index.js";
import { createClientSchema, updateClientSchema } from "../validators/client.js";

const clients = new Hono<{ Bindings: Env }>();

clients.get("/", async (c) => {
  const limitParam = c.req.query("limit");
  const limit =
    limitParam !== undefined ? parseInt(limitParam, 10) : undefined;

  if (limit !== undefined && (isNaN(limit) || limit < 1)) {
    return c.json(
      {
        success: false,
        error: {
          code: ErrorCode.VALIDATION_ERROR,
          message: "limit must be a positive integer",
          details: null,
        },
      },
      422
    );
  }

  const email = c.req.query("email");

  const db = createDb(c.env.DATABASE_URL);
  const rows = await listClients(db, { limit, email });
  return c.json({ success: true, data: rows });
});

clients.get("/:id", async (c) => {
  const db = createDb(c.env.DATABASE_URL);
  const id = c.req.param("id");
  const client = await getClientById(db, id);

  if (!client) {
    return c.json(
      {
        success: false,
        error: {
          code: ErrorCode.NOT_FOUND,
          message: `Client not found: ${id}`,
          details: null,
        },
      },
      404
    );
  }

  return c.json({ success: true, data: client });
});

clients.post("/", async (c) => {
  const body = await c.req.json().catch(() => null);
  const result = createClientSchema.safeParse(body);

  if (!result.success) {
    return c.json(
      {
        success: false,
        error: {
          code: ErrorCode.VALIDATION_ERROR,
          message: "Validation failed",
          details: result.error.issues,
        },
      },
      422
    );
  }

  try {
    const db = createDb(c.env.DATABASE_URL);
    const client = await insertClient(db, result.data);
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

clients.patch("/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => null);
  const result = updateClientSchema.safeParse(body ?? {});

  if (!result.success) {
    return c.json(
      {
        success: false,
        error: {
          code: ErrorCode.VALIDATION_ERROR,
          message: "Validation failed",
          details: result.error.issues,
        },
      },
      422
    );
  }

  const db = createDb(c.env.DATABASE_URL);
  const updated = await updateClient(db, id, result.data);

  if (!updated) {
    return c.json(
      {
        success: false,
        error: {
          code: ErrorCode.NOT_FOUND,
          message: `Client not found: ${id}`,
          details: null,
        },
      },
      404
    );
  }

  return c.json({ success: true, data: updated });
});

export default clients;
