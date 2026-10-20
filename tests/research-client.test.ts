import { afterEach, describe, it, expect, vi } from 'vitest';
import { startResearchLoop, type PublicJob } from '@/lib/research/client';
const job = (overrides: Partial<PublicJob> = {}): PublicJob => ({
  id: 'job',
  query: 'Example',
  status: 'running',
  currentStage: 0,
  completedStages: [],
  error: null,
  outputUrl: null,
  attempted: [],
  sources: [],
  ...overrides,
});
const response = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
afterEach(() => vi.useRealTimers());
describe('Cancellable browser research recovery loop', () => {
  it('retries the same unchanged stage automatically after a lease expires', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const seen: PublicJob[] = [];
    const fetcher = vi.fn(async (_url, init) => {
      if (init?.method === 'POST')
        return response(
          job({ status: 'completed', currentStage: 7, completedStages: [0, 1, 2, 3, 4, 5, 6] }),
        );
      return response(
        job({
          execution: {
            claimable: Date.now() >= 2000,
            leaseUntil: new Date(2000).toISOString(),
            retryAfterMs: Math.max(0, 2000 - Date.now()),
            terminal: false,
          },
        }),
      );
    }) as unknown as typeof fetch;
    const stop = startResearchLoop({
      jobId: 'job',
      accessCode: '',
      fetcher,
      onJob: (j) => seen.push(j),
      onError: vi.fn(),
      onRunning: vi.fn(),
    });
    await vi.advanceTimersByTimeAsync(2200);
    expect(seen.at(-1)?.status).toBe('completed');
    expect(
      (fetcher as ReturnType<typeof vi.fn>).mock.calls.filter((c) => c[1].method === 'POST'),
    ).toHaveLength(1);
    stop();
  });
  it('recovers from an explicit not-claimed POST and a transient POST error', async () => {
    vi.useFakeTimers();
    const onJob = vi.fn();
    let posts = 0;
    const fetcher = vi.fn(async (_url, init) => {
      if (init?.method === 'GET') return response(job());
      posts++;
      if (posts === 1)
        return response({
          ...job(),
          executionResult: {
            claimed: false,
            outcome: 'leased',
            leaseUntil: null,
            retryAfterMs: 1000,
          },
        });
      if (posts === 2) throw new TypeError('Temporary transport failure');
      return response(job({ status: 'completed', currentStage: 7 }));
    }) as unknown as typeof fetch;
    const stop = startResearchLoop({
      jobId: 'job',
      accessCode: '',
      fetcher,
      onJob,
      onError: vi.fn(),
      onRunning: vi.fn(),
    });
    await vi.advanceTimersByTimeAsync(4000);
    expect(posts).toBe(3);
    expect(onJob.mock.calls.at(-1)?.[0].status).toBe('completed');
    stop();
  });
  it('does not cancel an in-flight POST when the server moves queued to running', async () => {
    vi.useFakeTimers();
    let finish!: (response: Response) => void;
    let posts = 0;
    const seen: PublicJob[] = [];
    const fetcher = vi.fn(async (_url, init) => {
      if (init?.method === 'GET') return response(job({ status: 'queued' }));
      posts++;
      return new Promise<Response>((resolve) => {
        finish = resolve;
      });
    }) as unknown as typeof fetch;
    const stop = startResearchLoop({
      jobId: 'job',
      accessCode: '',
      fetcher,
      onJob: (j) => seen.push(j),
      onError: vi.fn(),
      onRunning: vi.fn(),
    });
    await vi.advanceTimersByTimeAsync(1);
    finish(response(job({ status: 'completed', currentStage: 7 })));
    await vi.advanceTimersByTimeAsync(1000);
    expect(posts).toBe(1);
    expect(seen.at(-1)?.status).toBe('completed');
    stop();
  });
  it.each(['completed', 'failed'] as const)('keeps %s terminal', async (status) => {
    vi.useFakeTimers();
    const fetcher = vi.fn(async () => response(job({ status }))) as unknown as typeof fetch;
    const stop = startResearchLoop({
      jobId: 'job',
      accessCode: '',
      fetcher,
      onJob: vi.fn(),
      onError: vi.fn(),
      onRunning: vi.fn(),
    });
    await vi.advanceTimersByTimeAsync(10000);
    expect(fetcher).toHaveBeenCalledTimes(1);
    stop();
  });
  it('bounds repeated failures and cancels outstanding scheduling', async () => {
    vi.useFakeTimers();
    const onError = vi.fn();
    const fetcher = vi.fn(async () => {
      throw new Error('offline');
    }) as unknown as typeof fetch;
    const stop = startResearchLoop({
      jobId: 'job',
      accessCode: '',
      fetcher,
      onJob: vi.fn(),
      onError,
      onRunning: vi.fn(),
    });
    await vi.advanceTimersByTimeAsync(60000);
    expect(fetcher).toHaveBeenCalledTimes(7);
    expect(onError.mock.calls.at(-1)?.[0]).toContain('Automatic retries stopped');
    stop();
    await vi.advanceTimersByTimeAsync(60000);
    expect(fetcher).toHaveBeenCalledTimes(7);
  });
});
