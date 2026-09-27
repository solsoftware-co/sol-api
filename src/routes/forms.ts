import { Hono } from "hono";
import { createDb } from "../lib/db.js";
import { isUuid } from "../lib/validation.js";
import { getForm } from "../services/forms.js";
import { notFoundResponse } from "../lib/responses.js";
import type { AppEnv } from "../types/index.js";

const forms = new Hono<AppEnv>();

forms.get("/:formId", async (c) => {
  const formId = c.req.param("formId");
  const notFound = () => notFoundResponse(c, `Form not found: ${formId}`);

  if (!isUuid(formId)) return notFound();

  const db = createDb(c.env.DATABASE_URL);
  const form = await getForm(db, formId);
  if (!form) return notFound();

  return c.json({ success: true, data: form });
});

export default forms;
