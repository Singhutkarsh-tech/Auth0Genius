import { z } from 'zod';
export const safeUrl = z
  .string()
  .url()
  .refine((v) => {
    const u = new URL(v);
    return u.protocol === 'https:' && !u.username && !u.password;
  }, 'A public HTTPS URL is required');
export const evidenceStatus = z.enum(['verified', 'estimated', 'unverified', 'not_applicable']);
export const evidenceTopic = z.enum([
  'oauth',
  'managed_auth',
  'approval',
  'scopes',
  'setup',
  'general',
]);
export const supportSchema = z.object({
  topic: evidenceTopic,
  conclusion: z.string(),
  review: z.enum(['reviewed', 'unresolved']),
  reviewedText: z.string().nullable(),
  references: z
    .array(z.object({ sourceId: z.string(), passage: z.string().min(1).max(3000) }))
    .min(1),
});
export const claimSchema = z.object({
  text: z.string().min(1).max(3000),
  status: evidenceStatus,
  sourceIds: z.array(z.string()).max(12),
  support: supportSchema.nullable().default(null),
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
  authority: z.enum(['provider', 'composio', 'third_party', 'unknown']).default('unknown'),
  topics: z.array(evidenceTopic).default([]),
  capture: z.enum(['fetched', 'review_summary', 'legacy']).default('legacy'),
  content: z.string().max(14000).nullable().default(null),
  originalUrl: safeUrl.nullable().default(null),
  contentHash: z.string().nullable().default(null),
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
  routes: z
    .array(z.enum(['managed', 'custom']))
    .min(1)
    .default(['custom']),
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
  approvalEvidence: claimSchema.default({
    text: 'Provider approval requirements remain unverified.',
    status: 'unverified',
    sourceIds: [],
    support: null,
  }),
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
  stageExemptions: z
    .array(
      z.object({
        route: z.enum(['managed', 'custom']),
        stage: z.enum(stages),
        reason: claimSchema,
      }),
    )
    .default([]),
  provenance: z.object({
    method: z.enum(['seed_research', 'live_research']),
    attempted: z.array(z.string()),
    limitations: z.array(z.string()),
  }),
});
export type Guide = z.infer<typeof guideSchema>;
export type Claim = z.infer<typeof claimSchema>;
export type Source = z.infer<typeof sourceSchema>;
// Authority, passage linkage, review, and classification consistency are separate checks.
// A matching passage is NOT proof of entailment: unresolved semantic review stays unverified.
export function validateEvidence(input: unknown): Guide {
  const guide = guideSchema.parse(input);
  const ids = new Set(guide.sources.map((s) => s.id));
  if (
    ids.size !== guide.sources.length ||
    new Set(guide.steps.map((s) => s.id)).size !== guide.steps.length
  )
    throw new Error('Duplicate source or step IDs');
  for (const source of guide.sources) {
    if (new URL(source.url).hostname !== source.domain) throw new Error('Evidence domain mismatch');
    if (source.authority === 'composio' && source.domain !== 'docs.composio.dev')
      throw new Error('Invalid Composio authority');
    if (source.authority === 'provider' && source.domain === 'docs.composio.dev')
      throw new Error('Composio is not provider evidence');
  }
  const walk = (value: unknown): void => {
    if (!value || typeof value !== 'object') return;
    if ('sourceIds' in value && 'status' in value) {
      const claim = claimSchema.parse(value);
      if (claim.sourceIds.some((id) => !ids.has(id))) throw new Error('Unknown evidence reference');
      if (['verified', 'not_applicable'].includes(claim.status) && !claim.sourceIds.length)
        throw new Error('Supported claims require evidence');
      if (claim.support) {
        for (const ref of claim.support.references) {
          const source = guide.sources.find((s) => s.id === ref.sourceId);
          if (!source || !claim.sourceIds.includes(ref.sourceId))
            throw new Error('Claim passage has an unknown evidence reference');
          if (
            !(
              source.content ?? (source.capture === 'review_summary' ? source.summary : '')
            ).includes(ref.passage)
          )
            throw new Error('Claim passage was not retained from the source');
          if (!source.topics.includes(claim.support.topic))
            throw new Error('Irrelevant source topic');
          if (
            ['oauth', 'approval', 'scopes'].includes(claim.support.topic) &&
            source.authority !== 'provider'
          )
            throw new Error('Provider claim requires relevant provider evidence');
          if (claim.support.topic === 'managed_auth' && source.authority !== 'composio')
            throw new Error('Managed auth requires Composio evidence');
        }
      }
      if (['verified', 'not_applicable'].includes(claim.status)) {
        if (
          !claim.sourceIds.some((id) => guide.sources.find((s) => s.id === id)?.type === 'official')
        )
          throw new Error('Verified claims require official evidence');
        if (
          !claim.support ||
          claim.support.review !== 'reviewed' ||
          claim.support.reviewedText !== claim.text
        )
          throw new Error('Verified claims require explicit semantic review of this exact claim');
        if (
          claim.support.references.some(
            (ref) => guide.sources.find((s) => s.id === ref.sourceId)?.type !== 'official',
          )
        )
          throw new Error('Verified claims require official evidence');
      }
    }
    for (const child of Object.values(value)) {
      if (Array.isArray(child)) child.forEach(walk);
      else walk(child);
    }
  };
  walk(guide);
  for (const [classification, claim, topic, unknown] of [
    [guide.oauthStatus, guide.oauthEvidence, 'oauth', 'unknown'],
    [guide.managedAuth, guide.managedEvidence, 'managed_auth', 'unknown'],
    [guide.approval, guide.approvalEvidence, 'approval', 'unknown'],
  ] as const) {
    if (
      classification !== unknown &&
      (claim.status !== 'verified' ||
        claim.support?.topic !== topic ||
        claim.support.conclusion !== classification)
    )
      throw new Error(`Inconsistent ${topic} classification and evidence`);
  }
  for (const exemption of guide.stageExemptions)
    if (exemption.reason.status !== 'not_applicable')
      throw new Error('Stage exemptions require reviewed not-applicable evidence');
  return guide;
}
export function visitClaims(guide: Guide, fn: (claim: Claim) => void) {
  const walk = (value: unknown): void => {
    if (!value || typeof value !== 'object') return;
    if ('sourceIds' in value && 'status' in value) fn(value as Claim);
    for (const child of Object.values(value)) {
      if (Array.isArray(child)) child.forEach(walk);
      else walk(child);
    }
  };
  walk(guide);
}
// Read legacy records without overwriting user data or retaining unsupported verified labels.
export function downgradeUnreviewed(input: unknown): Guide {
  const guide = guideSchema.parse(input);
  visitClaims(guide, (claim) => {
    if (
      ['verified', 'not_applicable'].includes(claim.status) &&
      (!claim.support ||
        claim.support.review !== 'reviewed' ||
        claim.support.reviewedText !== claim.text)
    )
      claim.status = 'unverified';
  });
  if (guide.oauthEvidence.status !== 'verified') {
    guide.oauthStatus = 'unknown';
    guide.oauthEvidence.status = 'unverified';
  }
  if (guide.managedEvidence.status !== 'verified') {
    guide.managedAuth = 'unknown';
    guide.managedEvidence.status = 'unverified';
  }
  if (guide.approvalEvidence.status !== 'verified') {
    guide.approval = 'unknown';
    guide.approvalEvidence.status = 'unverified';
  }
  guide.stageExemptions = guide.stageExemptions.filter((e) => e.reason.status === 'not_applicable');
  guide.status = 'partial';
  if (
    guide.provenance.method === 'live_research' &&
    (guide.oauthStatus === 'unknown' || guide.managedAuth === 'unknown')
  )
    guide.description =
      'Partial provider research. Review retained sources before choosing an authentication route.';
  return validateEvidence(guide);
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
