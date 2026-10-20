import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';
const mocks = await vi.hoisted(async () => {
  const fs = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'a0g-pipeline-'));
  const file = path.join(directory, 'test.db');
  fs.writeFileSync(file, '');
  process.env.DATABASE_URL = `file:${file}`;
  process.env.OPENAI_API_KEY = 'test-not-a-real-key';
  process.env.TAVILY_API_KEY = 'test-not-a-real-key';
  return { search: vi.fn(), retrieve: vi.fn(), identify: vi.fn(), synthesize: vi.fn(), directory };
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
  rmSync(mocks.directory, { recursive: true, force: true });
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
      query: 'GitHub pipeline fixture',
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
    expect(saved.content).toMatchObject({
      slug: 'pipeline-fixture',
      status: 'partial',
      oauthStatus: 'unknown',
    });
    await advanceJob(job.id);
    expect(mocks.synthesize).toHaveBeenCalledTimes(1);
    expect(await db.guide.count()).toBe(1);
  });
  it('uses one bounded identity fallback when discovery returns unrelated aggregators', async () => {
    mocks.search.mockResolvedValueOnce([
      { title: 'Wiki', url: 'https://en.wikipedia.org/wiki/GitHub', content: '' },
    ]);
    const job = await newJob();
    expect((await advanceJob(job.id)).outcome).toBe('advanced');
    expect(mocks.search).toHaveBeenCalledTimes(2);
    expect(mocks.identify.mock.calls[0][1]).toEqual([
      { title: 'GitHub OAuth', url: guide.website, content: 'Official docs' },
    ]);
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
  it('retries transient retrieval failures a bounded number of times before terminal failure', async () => {
    mocks.search.mockRejectedValue(new Error('Search provider unavailable (HTTP 503)'));
    const job = await newJob();
    expect((await advanceJob(job.id)).outcome).toBe('retry');
    expect((await advanceJob(job.id)).outcome).toBe('retry');
    const terminal = await advanceJob(job.id);
    expect(terminal.outcome).toBe('failed');
    const state = await db.researchJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(state.status).toBe('failed');
    expect(state.currentStage).toBe(0);
    expect(state.completedStages).toEqual([]);
    expect(await db.guide.count()).toBe(0);
  });
  it('pauses OAuth research for identity confirmation, then resumes only the selected candidate', async () => {
    const job = await newJob();
    const candidateResults = [
      { title: 'Figma design platform', url: 'https://www.figma.com/', content: 'Collaborative design tools.' },
      { title: 'Figma Japan', url: 'https://figma.jp/', content: 'A separate local company.' },
    ];
    mocks.identify
      .mockResolvedValueOnce({
        ambiguous: true,
        reason: 'Two plausible companies use this name.',
        candidates: candidateResults.map((r) => ({
          name: r.title,
          website: new URL(r.url).origin,
          description: r.content,
          evidenceUrl: r.url,
          evidenceSummary: r.content,
        })),
        results: candidateResults,
      })
      .mockResolvedValueOnce({ name: 'Figma', website: 'https://www.figma.com', ambiguous: false });

    expect((await advanceJob(job.id)).outcome).toBe('blocked');
    let state = await db.researchJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(state.status).toBe('blocked');
    expect(state.currentStage).toBe(0);
    expect(mocks.search).toHaveBeenCalledTimes(1);
    expect((await advanceJob(job.id)).outcome).toBe('blocked');
    expect(mocks.search).toHaveBeenCalledTimes(1);

    expect((await advanceJob(job.id, { candidateIndex: 0 })).outcome).toBe('advanced');
    state = await db.researchJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(state.currentStage).toBe(1);
    expect((state.context as { identity: { website: string } }).identity.website).toBe(
      'https://www.figma.com',
    );
    expect(mocks.identify).toHaveBeenCalledTimes(2);
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
  it('returns retry metadata for an active lease, then reclaims it after expiry', async () => {
    const job = await newJob();
    await db.researchJob.update({
      where: { id: job.id },
      data: { status: 'running', leaseUntil: new Date(Date.now() + 5000) },
    });
    const refused = await advanceJob(job.id);
    expect(refused.claimed).toBe(false);
    expect(refused.outcome).toBe('leased');
    expect(refused.retryAfterMs).toBeGreaterThan(0);
    await db.researchJob.update({
      where: { id: job.id },
      data: { leaseUntil: new Date(Date.now() - 1) },
    });
    expect((await advanceJob(job.id)).outcome).toBe('advanced');
    expect(mocks.search).toHaveBeenCalledTimes(1);
  });
  it('prevents two requests from executing a stage concurrently', async () => {
    let release!: (result: unknown[]) => void;
    const pending = new Promise<unknown[]>((resolve) => (release = resolve));
    mocks.search.mockReturnValueOnce(pending);
    const job = await newJob();
    const first = advanceJob(job.id);
    await vi.waitFor(() => expect(mocks.search).toHaveBeenCalledTimes(1));
    const second = await advanceJob(job.id);
    expect(second.outcome).toBe('leased');
    release([{ title: 'GitHub', url: guide.website, content: 'Official provider' }]);
    await first;
    expect(mocks.search).toHaveBeenCalledTimes(1);
    expect((await db.researchJob.findUniqueOrThrow({ where: { id: job.id } })).currentStage).toBe(
      1,
    );
  });
  it('fences a stale worker after a different request reclaims the expired lease', async () => {
    let release!: (result: unknown[]) => void;
    mocks.search.mockReturnValueOnce(new Promise((resolve) => (release = resolve)));
    const job = await newJob();
    const stale = advanceJob(job.id);
    await vi.waitFor(() => expect(mocks.search).toHaveBeenCalledTimes(1));
    await db.researchJob.update({
      where: { id: job.id },
      data: { leaseUntil: new Date(Date.now() - 1) },
    });
    await advanceJob(job.id);
    release([{ title: 'GitHub', url: guide.website, content: 'Official provider' }]);
    expect((await stale).outcome).toBe('superseded');
    const saved = await db.researchJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(saved.currentStage).toBe(1);
    expect(saved.completedStages).toEqual([0]);
  });
  it('rolls back the guide and evidence if publication completion fails', async () => {
    const job = await newJob();
    for (let i = 0; i < 6; i++) await advanceJob(job.id);
    await db.$executeRawUnsafe(
      "CREATE TRIGGER interrupt_publication BEFORE UPDATE ON ResearchJob WHEN NEW.status = 'completed' BEGIN SELECT RAISE(ABORT, 'simulated completion interruption'); END;",
    );
    try {
      expect((await advanceJob(job.id)).outcome).toBe('failed');
      expect(await db.guide.count()).toBe(0);
      expect(await db.evidenceSource.count()).toBe(0);
      expect((await db.researchJob.findUniqueOrThrow({ where: { id: job.id } })).status).toBe('failed');
    } finally {
      await db.$executeRawUnsafe('DROP TRIGGER interrupt_publication');
    }
    expect((await advanceJob(job.id)).outcome).toBe('terminal');
    expect(await db.guide.count()).toBe(0);
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
    process.env.RESEARCH_ACCESS_CODE = 'test-access-code';
    let status = 200;
    for (let i = 0; i < 6; i++) {
      const result = await createResearch(
        new Request('http://localhost:3000/api/research', {
          method: 'POST',
          body: JSON.stringify({ query: `Unfamiliar quota fixture ${i}`, accessCode: 'test-access-code' }),
        }),
      );
      status = result.status;
    }
    expect(status).toBe(429);
    expect(await db.researchJob.count()).toBe(5);
    delete process.env.RESEARCH_ACCESS_CODE;
  });
  it('allows passwordless evaluator access only with strict persistent public quotas', async () => {
    process.env.RESEARCH_ACCESS_CODE = 'test-access-code';
    process.env.RESEARCH_PUBLIC_ACCESS = 'true';
    try {
      const submit = (query: string) =>
        createResearch(
          new Request('http://localhost:3000/api/research', {
            method: 'POST',
            body: JSON.stringify({ query }),
          }),
        );
      expect((await submit('Public evaluator app one')).status).toBe(201);
      expect((await submit('Public evaluator app two')).status).toBe(201);
      expect((await submit('Public evaluator app three')).status).toBe(429);
    } finally {
      delete process.env.RESEARCH_ACCESS_CODE;
      delete process.env.RESEARCH_PUBLIC_ACCESS;
    }
  });
});
