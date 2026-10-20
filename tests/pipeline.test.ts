import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import { unlinkSync, existsSync } from 'node:fs';
const mocks = vi.hoisted(() => {
  process.env.DATABASE_URL = `file:/tmp/auth0genius-pipeline-${process.pid}.db`;
  process.env.OPENAI_API_KEY = 'test-not-a-real-key';
  process.env.TAVILY_API_KEY = 'test-not-a-real-key';
  return { search: vi.fn(), retrieve: vi.fn(), identify: vi.fn(), synthesize: vi.fn() };
});
vi.mock('@/lib/research/retrieval', async () => {
  const actual = await vi.importActual<typeof import('@/lib/research/retrieval')>(
    '@/lib/research/retrieval',
  );
  return { ...actual, searchWeb: mocks.search, retrieve: mocks.retrieve };
});
vi.mock('@/lib/research/synthesis', async () => {
  const actual = await vi.importActual<typeof import('@/lib/research/synthesis')>(
    '@/lib/research/synthesis',
  );
  return { ...actual, identifyProvider: mocks.identify, synthesize: mocks.synthesize };
});
import { db } from '@/lib/db';
import { advanceJob } from '@/lib/research/engine';
import { seedGuides } from '@/data/seed-providers';
import { POST as createResearch } from '@/app/api/research/route';
const guide = structuredClone(seedGuides[2]);
guide.slug = 'pipeline-fixture';
guide.name = 'Pipeline fixture';
guide.featured = false;
guide.provenance.method = 'live_research';
beforeAll(() => {
  execFileSync(
    process.execPath,
    [
      'node_modules/prisma/build/index.js',
      'db',
      'push',
      '--schema',
      'prisma/schema.prisma',
      '--skip-generate',
    ],
    { env: process.env, stdio: 'pipe' },
  );
});
afterAll(async () => {
  await db.$disconnect();
  const path = process.env.DATABASE_URL!.slice(5);
  if (existsSync(path)) unlinkSync(path);
});
beforeEach(async () => {
  vi.clearAllMocks();
  await db.researchJob.deleteMany();
  await db.provider.deleteMany();
  await db.researchQuota.deleteMany();
  mocks.search.mockResolvedValue([
    { title: 'GitHub OAuth', url: guide.website, content: 'Official docs' },
  ]);
  mocks.identify.mockResolvedValue({ name: guide.name, website: guide.website });
  mocks.retrieve
    .mockResolvedValue({ sources: [], attempts: ['No additional sources'] })
    .mockResolvedValueOnce({
      sources: guide.sources.map((s) => ({ ...s, text: s.summary })),
      attempts: ['Fetched official fixture documentation (mocked)'],
    });
  mocks.synthesize.mockResolvedValue(structuredClone(guide));
});
async function newJob() {
  return db.researchJob.create({
    data: {
      query: 'Pipeline fixture',
      normalizedProvider: 'pipeline-fixture',
      completedStages: [],
      context: { sources: [], attempted: [] },
    },
  });
}
describe('Research engine with mocked search and LLM, real SQLite persistence', () => {
  it('executes each real engine stage and saves a valid independently loadable guide', async () => {
    const job = await newJob();
    for (let stage = 0; stage < 7; stage++) {
      await advanceJob(job.id);
      const current = await db.researchJob.findUniqueOrThrow({ where: { id: job.id } });
      expect(current.currentStage).toBe(stage + 1);
      expect(current.completedStages).toHaveLength(stage + 1);
      expect(current.status).toBe(stage === 6 ? 'completed' : 'running');
    }
    expect(mocks.search).toHaveBeenCalledTimes(4);
    expect(mocks.synthesize).toHaveBeenCalledTimes(1);
    const saved = await db.guide.findFirstOrThrow({ include: { provider: true, sources: true } });
    expect(saved.provider.slug).toBe('pipeline-fixture');
    expect(saved.sources).toHaveLength(guide.sources.length);
    expect(saved.content).toMatchObject({ slug: 'pipeline-fixture', status: 'sourced' });
    await advanceJob(job.id);
    expect(mocks.synthesize).toHaveBeenCalledTimes(1);
  });
  it('preserves featured status, known aliases and the trusted logo when refreshing a seeded provider', async () => {
    const { saveGuide } = await import('@/lib/db/guides');
    const base = structuredClone(seedGuides[2]);
    await saveGuide(base);
    const refreshed = {
      ...base,
      featured: false,
      logo: null,
      aliases: [],
      provenance: { ...base.provenance, method: 'live_research' as const },
    };
    await saveGuide(refreshed);
    const latest = await db.guide.findFirstOrThrow({ orderBy: { version: 'desc' } });
    expect(latest.content).toMatchObject({
      version: 2,
      featured: true,
      logo: base.logo,
      aliases: base.aliases,
    });
  });
  it('records retrieval failure without completing the stage or fabricating a guide', async () => {
    mocks.search.mockRejectedValueOnce(new Error('Search provider unavailable (HTTP 503)'));
    const job = await newJob();
    await advanceJob(job.id);
    const state = await db.researchJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(state.status).toBe('failed');
    expect(state.currentStage).toBe(0);
    expect(state.completedStages).toEqual([]);
    expect(await db.guide.count()).toBe(0);
  });
  it('rejects schema-invalid synthesis before saving', async () => {
    mocks.synthesize.mockResolvedValueOnce({ ...guide, difficulty: 'Unbelievably easy' });
    const job = await newJob();
    for (let i = 0; i < 6; i++) await advanceJob(job.id);
    const state = await db.researchJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(state.status).toBe('failed');
    expect(state.currentStage).toBe(5);
    expect(await db.guide.count()).toBe(0);
  });
  it('does not run a stage already leased by another request', async () => {
    const job = await newJob();
    await db.researchJob.update({
      where: { id: job.id },
      data: { leaseUntil: new Date(Date.now() + 100000) },
    });
    await advanceJob(job.id);
    expect(mocks.search).not.toHaveBeenCalled();
  });
  it('reuses an active normalized provider request', async () => {
    const req = () =>
      new Request('http://localhost:3000/api/research', {
        method: 'POST',
        body: JSON.stringify({ query: 'Unfamiliar fixture app' }),
      });
    const first = await createResearch(req());
    const second = await createResearch(req());
    const a = await first.json();
    const b = await second.json();
    expect(a.jobId).toBe(b.jobId);
    expect(b.duplicate).toBe(true);
    expect(await db.researchJob.count()).toBe(1);
  });
  it('enforces a persistent per-caller quota', async () => {
    let status = 200;
    for (let i = 0; i < 6; i++) {
      const result = await createResearch(
        new Request('http://localhost:3000/api/research', {
          method: 'POST',
          body: JSON.stringify({ query: `Unfamiliar quota fixture ${i}` }),
        }),
      );
      status = result.status;
    }
    expect(status).toBe(429);
    expect(await db.researchJob.count()).toBe(5);
  });
});
