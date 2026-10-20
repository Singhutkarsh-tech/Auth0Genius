import { z } from 'zod';
export const safeUrl = z
  .string()
  .url()
  .refine((v) => {
    const u = new URL(v);
    return u.protocol === 'https:' && !u.username && !u.password;
  }, 'A public HTTPS URL is required');
export const evidenceStatus = z.enum(['verified', 'estimated', 'unverified', 'not_applicable']);
export const claimSchema = z.object({
  text: z.string().min(1).max(3000),
  status: evidenceStatus,
  sourceIds: z.array(z.string()).max(12),
});
export const stages = ['Register', 'Configure', 'Test', 'Verify', 'Launch'] as const;
export const sourceSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  url: safeUrl,
  domain: z.string().min(1),
  type: z.enum(['official', 'third_party']),
  accessedAt: z.iso.datetime(),
  summary: z.string().min(1),
});
export const stepSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  title: z.string().min(1),
  detail: claimSchema,
  owner: z.enum(['Human', 'Agent', 'Shared']),
  stage: z.enum(stages),
  url: safeUrl.nullable(),
  note: z.string().nullable(),
  effort: z.string().nullable(),
  blocker: z.string().nullable(),
});
export const guideSchema = z.object({
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  name: z.string().min(1).max(100),
  website: safeUrl,
  description: z.string().max(400),
  category: z.string().max(80),
  aliases: z.array(z.string()),
  logo: z.string().nullable(),
  featured: z.boolean(),
  version: z.number().int().positive(),
  status: z.enum(['sourced', 'partial']),
  oauthStatus: z.enum(['supported', 'unsupported', 'unknown']),
  oauthEvidence: claimSchema,
  managedAuth: z.enum(['available', 'unavailable', 'unknown']),
  managedEvidence: claimSchema,
  difficulty: z.enum(['Easy', 'Moderate', 'Complex', 'Unknown']),
  difficultyExplanation: claimSchema,
  setupEffort: claimSchema,
  approval: z.enum(['not_required', 'conditional', 'required', 'unknown']),
  approvalTime: claimSchema,
  mainBlocker: claimSchema,
  prerequisites: z.array(z.string()),
  steps: z.array(stepSchema).min(1).max(15),
  approvalDetails: z.array(z.object({ title: z.string(), detail: claimSchema })).min(1),
  troubleshooting: z.array(
    z.object({ symptom: z.string(), reason: claimSchema, action: z.string() }),
  ),
  agentResponsibilities: z.array(z.string()),
  humanResponsibilities: z.array(z.string()),
  unknowns: z.array(z.string()),
  sources: z.array(sourceSchema).min(1).max(12),
  generatedAt: z.iso.datetime(),
  checkedAt: z.iso.datetime().nullable(),
  provenance: z.object({
    method: z.enum(['seed_research', 'live_research']),
    attempted: z.array(z.string()),
    limitations: z.array(z.string()),
  }),
});
export type Guide = z.infer<typeof guideSchema>;
export type Claim = z.infer<typeof claimSchema>;
export type Source = z.infer<typeof sourceSchema>;
export function validateEvidence(input: unknown): Guide {
  const guide = guideSchema.parse(input);
  const ids = new Set(guide.sources.map((s) => s.id));
  if (
    ids.size !== guide.sources.length ||
    new Set(guide.steps.map((s) => s.id)).size !== guide.steps.length
  )
    throw new Error('Duplicate source or step IDs');
  for (const source of guide.sources)
    if (new URL(source.url).hostname !== source.domain) throw new Error('Evidence domain mismatch');
  const walk = (value: unknown) => {
    if (!value || typeof value !== 'object') return;
    if ('sourceIds' in value && 'status' in value) {
      const claim = claimSchema.parse(value);
      if (claim.sourceIds.some((id) => !ids.has(id))) throw new Error('Unknown evidence reference');
      if (['verified', 'not_applicable'].includes(claim.status) && !claim.sourceIds.length)
        throw new Error('Supported claims require evidence');
      if (
        claim.status === 'verified' &&
        !claim.sourceIds.some((id) => guide.sources.find((s) => s.id === id)?.type === 'official')
      )
        throw new Error('Verified claims require official evidence');
    }
    for (const child of Object.values(value))
      if (Array.isArray(child)) child.forEach(walk);
      else walk(child);
  };
  walk(guide);
  return guide;
}
export const researchInput = z.object({
  query: z
    .string()
    .trim()
    .min(2)
    .max(200)
    .refine((v) => !/[\x00-\x1f]/.test(v), 'Invalid input'),
  useCase: z.string().trim().max(500).optional(),
  accessCode: z.string().max(200).optional(),
});
