import { z } from "zod";

/**
 * A skill is a self-contained, reusable capability the agent can load —
 * matching the Conway-Research/skills format described in the spec (a
 * manifest plus a handler entrypoint). We define our own minimal schema
 * here rather than depending on that external repo's exact format, since
 * it's marked WIP upstream.
 */
export const skillManifestSchema = z.object({
  name: z.string().min(1),
  version: z.string().min(1),
  description: z.string().min(1),
  entrypoint: z.string().min(1),
  estimatedCostCredits: z.number().nonnegative().default(0),
  tags: z.array(z.string()).default([]),
});

export type SkillManifest = z.infer<typeof skillManifestSchema>;

export function parseSkillManifest(raw: unknown): SkillManifest {
  return skillManifestSchema.parse(raw);
}
