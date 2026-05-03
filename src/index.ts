import { Hono } from "hono";
import { errorHandler } from "./middleware/error.js";
import { requireApiKey } from "./middleware/auth.js";
import health from "./routes/health.js";
import clients from "./routes/clients.js";
import type { Env } from "./types/index.js";

const app = new Hono<{ Bindings: Env }>();

app.onError(errorHandler);

app.route("/health", health);
app.use("/v1/*", requireApiKey);
app.route("/v1/clients", clients);

export default app;
