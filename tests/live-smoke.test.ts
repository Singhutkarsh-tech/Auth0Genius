import { describe, it, expect, vi } from 'vitest';
import { runLiveResearch } from '@/lib/research/smoke';
import { liveGuide } from './helpers/live-guide';
const response = (data: unknown) => new Response(JSON.stringify(data));
describe('Fresh live smoke acceptance reporting', () => {
  it('reports saved library reuse without performing or claiming fresh generation', async () => {
    const g = liveGuide();
    const fetcher = vi.fn(async () => response({ existing: true, url: `/providers/${g.slug}` })) as unknown as typeof fetch;
    const result = await runLiveResearch({
      base: 'http://localhost:3182',
      input: g.name,
      fetcher,
      report: vi.fn(),
    });
    expect(result.outcome).toBe('reused');
    expect(result.fresh).toBe(false);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('does not count an active duplicate as a fresh run', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(response({ jobId: 'previous', duplicate: true }));
    const result = await runLiveResearch({
      base: 'http://localhost:3182',
      input: 'new provider',
      fetcher,
      report: vi.fn(),
    });
    expect(result.outcome).toBe('reused');
    expect(result.fresh).toBe(false);
  });
  it('accepts provider input and records actual missing-configuration failure', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(response({ jobId: 'new' }))
      .mockResolvedValueOnce(
        response({
          status: 'failed',
          currentStage: 0,
          completedStages: [],
          sources: [],
          attempted: [],
          error: 'Missing OPENAI_API_KEY and TAVILY_API_KEY',
        }),
      );
    const result = await runLiveResearch({
      base: 'http://localhost:3182',
      input: 'Unseeded provider',
      fetcher,
      report: vi.fn(),
    });
    expect(JSON.parse(fetcher.mock.calls[0][1].body).query).toBe('Unseeded provider');
    expect(result.outcome).toBe('failed');
    expect(result.error).toContain('OPENAI_API_KEY');
    expect(result.outputUrl).toBeUndefined();
  });
  it('stops at an identity confirmation gate instead of polling forever', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(response({ jobId: 'new-identity' }))
      .mockResolvedValueOnce(
        response({
          status: 'blocked',
          currentStage: 0,
          completedStages: [],
          sources: [],
          attempted: ['Fetched the supplied website; two candidates remain.'],
          error: 'Confirm which provider you mean.',
          identityCandidates: [{ name: 'Candidate' }],
        }),
      );
    const result = await runLiveResearch({
      base: 'http://localhost:3182',
      input: 'ambiguous.example',
      fetcher,
      report: vi.fn(),
    });
    expect(result.outcome).toBe('blocked');
    expect(result.fresh).toBe(true);
    expect(result.error).toContain('Confirm');
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
