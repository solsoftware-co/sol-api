import { z } from "zod";

const uuid = z
  .string()
  .uuid()
  .transform((id) => id.toLowerCase());

// Five fields (minute hour day-of-month month day-of-week), read in the
// client's timezone, e.g. "0 9 * * 2" for Tuesdays at 9am. Numbers and
// * , / - only.
const cronField = /^[0-9*,/-]+$/;

export const createAnalyticsReportSchema = z
  .object({
    // A reference: must be one of this client's sites.
    siteId: uuid,
    enabled: z.boolean().default(true),
    cron: z
      .string()
      .trim()
      .refine((v) => {
        const fields = v.split(/\s+/);
        return fields.length === 5 && fields.every((f) => cronField.test(f));
      }, 'must be a 5-field cron expression, e.g. "0 9 * * 2"'),
    // Matches analytics_reports_lookback_check.
    lookback: z.enum(["last_week", "last_month", "last_7_days", "last_28_days"]),
    // References: the client's channels the report is sent to.
    channelIds: z
      .array(uuid)
      .default([])
      .refine((ids) => new Set(ids).size === ids.length, { message: "Channel listed more than once" }),
  })
  .strict();

export type CreateAnalyticsReportInput = z.infer<typeof createAnalyticsReportSchema>;
