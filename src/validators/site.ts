import { z } from "zod";

// A bare host like "acme.com" or "staging.acme.com", no scheme or path.
const host = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^(?!-)[a-z0-9-]+(\.[a-z0-9-]+)+$/, 'must be a bare host, e.g. "acme.com"');

const branch = z.string().trim().min(1).max(255);

// A site and its 1:1 halves (sanity_configs, github_repos) are created
// together. ga4ServiceAccountId is a reference: it must be one of this
// client's service accounts.
export const createSiteSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    description: z.string().trim().max(1000).nullable().optional(),
    domain: host.nullable().optional(),
    stagingDomain: host.nullable().optional(),
    ga4PropertyId: z.string().trim().regex(/^\d+$/, "must be a numeric GA4 property id").nullable().optional(),
    ga4ServiceAccountId: z
      .string()
      .uuid()
      .transform((id) => id.toLowerCase())
      .nullable()
      .optional(),
    sanityConfig: z
      .object({
        projectId: z.string().trim().min(1),
        prodDataset: z.string().trim().min(1),
        stagingDataset: z.string().trim().min(1),
      })
      .strict()
      .nullable()
      .optional(),
    githubRepo: z
      .object({
        repoUrl: z.string().trim().url().startsWith("https://github.com/"),
        // Omitted means "main".
        defaultBranch: branch.optional(),
        stagingBranch: branch.nullable().optional(),
      })
      .strict()
      .nullable()
      .optional(),
  })
  .strict();

export type CreateSiteInput = z.infer<typeof createSiteSchema>;
