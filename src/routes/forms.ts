import { Hono, type Context } from "hono";
import { createDb } from "../lib/db.js";
import { isUuid } from "../lib/validation.js";
import {
  getForm,
  createForm,
  updateForm,
  putFormIntegration,
  removeFormIntegration,
  putFormChannel,
  removeFormChannel,
  ClientNotFoundError,
  FormNotFoundError,
  LinkTargetNotFoundError,
  InvalidReferencesError,
} from "../services/forms.js";
import { notFoundResponse, validationErrorResponse } from "../lib/responses.js";
import {
  createFormSchema,
  updateFormSchema,
  putFormIntegrationSchema,
  putFormChannelSchema,
} from "../validators/form.js";
import { logger } from "../lib/logger.js";
import type { AppEnv } from "../types/index.js";

const forms = new Hono<AppEnv>();

// Every write responds with the whole form (what GET returns), and maps the
// service's errors the same way: an unknown client, form, or path id is a
// 404; bad ids in the body are a 422 naming them.
function writeError(c: Context<AppEnv>, err: unknown) {
  if (
    err instanceof ClientNotFoundError ||
    err instanceof FormNotFoundError ||
    err instanceof LinkTargetNotFoundError
  ) {
    return notFoundResponse(c, err.message);
  }
  if (err instanceof InvalidReferencesError) return validationErrorResponse(c, err.message, err.details);
  throw err;
}

// Path ids are compared with ids Postgres returns, which are lowercase.
function pathUuid(c: Context<AppEnv>, name: string): string | null {
  const value = c.req.param(name);
  return value && isUuid(value) ? value.toLowerCase() : null;
}

forms.post("/:clientId/forms", async (c) => {
  const clientId = c.req.param("clientId");

  const body = await c.req.json().catch(() => null);
  const result = createFormSchema.safeParse(body);
  if (!result.success) {
    return validationErrorResponse(c, "Validation failed", result.error.issues);
  }

  try {
    const db = createDb(c.env.DATABASE_URL);
    const created = await createForm(db, clientId, result.data);
    logger.info("created form", {
      clientId,
      formId: created.id,
      integrations: created.integrations.length,
      channels: created.channels.length,
    });
    return c.json({ success: true, data: created }, 201);
  } catch (err) {
    return writeError(c, err);
  }
});

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

// The form's own fields only; its links have the routes below.
forms.patch("/:clientId/forms/:formId", async (c) => {
  const clientId = c.req.param("clientId");
  const formId = pathUuid(c, "formId");
  if (!formId) return notFoundResponse(c, `Form not found: ${c.req.param("formId")}`);

  const body = await c.req.json().catch(() => null);
  const result = updateFormSchema.safeParse(body);
  if (!result.success) {
    return validationErrorResponse(c, "Validation failed", result.error.issues);
  }

  try {
    const db = createDb(c.env.DATABASE_URL);
    const form = await updateForm(db, clientId, formId, result.data);
    logger.info("updated form", { clientId, formId });
    return c.json({ success: true, data: form });
  } catch (err) {
    return writeError(c, err);
  }
});

// Links a form to one of the client's integrations, or replaces the link's
// field mapping.
forms.put("/:clientId/forms/:formId/integrations/:integrationId", async (c) => {
  const clientId = c.req.param("clientId");
  const formId = pathUuid(c, "formId");
  const integrationId = pathUuid(c, "integrationId");
  if (!formId) return notFoundResponse(c, `Form not found: ${c.req.param("formId")}`);
  if (!integrationId) return notFoundResponse(c, `Integration not found: ${c.req.param("integrationId")}`);

  const body = await c.req.json().catch(() => null);
  const result = putFormIntegrationSchema.safeParse(body);
  if (!result.success) {
    return validationErrorResponse(c, "Validation failed", result.error.issues);
  }

  try {
    const db = createDb(c.env.DATABASE_URL);
    const form = await putFormIntegration(db, clientId, formId, integrationId, result.data);
    logger.info("linked form integration", { clientId, formId, integrationId });
    return c.json({ success: true, data: form });
  } catch (err) {
    return writeError(c, err);
  }
});

// Unlinks the integration, including from every notification reporting on it.
forms.delete("/:clientId/forms/:formId/integrations/:integrationId", async (c) => {
  const clientId = c.req.param("clientId");
  const formId = pathUuid(c, "formId");
  const integrationId = pathUuid(c, "integrationId");
  if (!formId) return notFoundResponse(c, `Form not found: ${c.req.param("formId")}`);
  if (!integrationId) return notFoundResponse(c, `Integration not found: ${c.req.param("integrationId")}`);

  try {
    const db = createDb(c.env.DATABASE_URL);
    const form = await removeFormIntegration(db, clientId, formId, integrationId);
    logger.info("unlinked form integration", { clientId, formId, integrationId });
    return c.json({ success: true, data: form });
  } catch (err) {
    return writeError(c, err);
  }
});

// Links a form to one of the client's channels, or replaces how the form
// notifies it (settings left out go back to their defaults).
forms.put("/:clientId/forms/:formId/channels/:channelId", async (c) => {
  const clientId = c.req.param("clientId");
  const formId = pathUuid(c, "formId");
  const channelId = pathUuid(c, "channelId");
  if (!formId) return notFoundResponse(c, `Form not found: ${c.req.param("formId")}`);
  if (!channelId) return notFoundResponse(c, `Channel not found: ${c.req.param("channelId")}`);

  const body = await c.req.json().catch(() => null);
  const result = putFormChannelSchema.safeParse(body);
  if (!result.success) {
    return validationErrorResponse(c, "Validation failed", result.error.issues);
  }

  try {
    const db = createDb(c.env.DATABASE_URL);
    const form = await putFormChannel(db, clientId, formId, channelId, result.data);
    logger.info("linked form channel", { clientId, formId, channelId });
    return c.json({ success: true, data: form });
  } catch (err) {
    return writeError(c, err);
  }
});

forms.delete("/:clientId/forms/:formId/channels/:channelId", async (c) => {
  const clientId = c.req.param("clientId");
  const formId = pathUuid(c, "formId");
  const channelId = pathUuid(c, "channelId");
  if (!formId) return notFoundResponse(c, `Form not found: ${c.req.param("formId")}`);
  if (!channelId) return notFoundResponse(c, `Channel not found: ${c.req.param("channelId")}`);

  try {
    const db = createDb(c.env.DATABASE_URL);
    const form = await removeFormChannel(db, clientId, formId, channelId);
    logger.info("unlinked form channel", { clientId, formId, channelId });
    return c.json({ success: true, data: form });
  } catch (err) {
    return writeError(c, err);
  }
});

export default forms;
