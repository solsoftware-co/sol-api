import { Hono } from "hono";
import { createDb } from "../lib/db.js";
import { isUuid } from "../lib/validation.js";
import { getForm } from "../services/forms.js";
import { notFoundResponse } from "../lib/responses.js";
import type { AppEnv } from "../types/index.js";

const forms = new Hono<AppEnv>();

// Client-scoped like every other by-id lookup: a form id under the wrong
// client is a 404, not another client's form.
forms.get("/:clientId/forms/:formId", async (c) => {
  const clientId = c.req.param("clientId");
  const formId = c.req.param("formId");
  const notFound = () => notFoundResponse(c, `Form not found: ${formId}`);

  if (!isUuid(formId)) return notFound();

  const db = createDb(c.env.DATABASE_URL);
  const form = await getForm(db, clientId, formId);
  if (!form) return notFound();

  return c.json({ success: true, data: form });
});

export default forms;
