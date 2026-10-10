import { Hono } from "hono";
import { errorHandler } from "./middleware/error.js";
import { requireApiKey } from "./middleware/auth.js";
import { requestLogger } from "./middleware/request-logger.js";
import health from "./routes/health.js";
import clients from "./routes/clients.js";
import slackChannels from "./routes/slack-channels.js";
import integrations from "./routes/integrations.js";
import clientSites from "./routes/client-sites.js";
import sites from "./routes/sites.js";
import forms from "./routes/forms.js";
import formApiKeys from "./routes/form-api-keys.js";
import channels from "./routes/channels.js";
import googleServiceAccounts from "./routes/google-service-accounts.js";
import analyticsReports from "./routes/analytics-reports.js";
import clientAnalyticsReports from "./routes/client-analytics-reports.js";
import notificationLogs from "./routes/notification-logs.js";
import legacyClients from "./legacy/clients.route.js";
import legacyNotificationLogs from "./legacy/notification-logs.route.js";
import type { AppEnv } from "./types/index.js";

const app = new Hono<AppEnv>();

app.onError(errorHandler);
app.use("*", requestLogger);

app.route("/health", health);
app.use("/v1/*", requireApiKey);
app.route("/v1/clients", clients);
app.route("/v1/clients", slackChannels);
app.route("/v1/clients", integrations);
app.route("/v1/clients", clientSites);
app.route("/v1/clients", channels);
app.route("/v1/clients", googleServiceAccounts);
app.route("/v1/clients", clientAnalyticsReports);
app.route("/v1/clients", forms);
app.route("/v1/clients", formApiKeys);
app.route("/v1/sites", sites);
app.route("/v1/analytics-reports", analyticsReports);
app.route("/v1/notification-logs", notificationLogs);
app.use("/legacy/*", requireApiKey);
app.route("/legacy/clients", legacyClients);
app.route("/legacy/notification-logs", legacyNotificationLogs);

export default app;
