import { describe, it, expect, vi } from 'vitest';
vi.mock('@/lib/research/network', async () => {
  const actual =
    await vi.importActual<typeof import('@/lib/research/network')>('@/lib/research/network');
  return {
    ...actual,
    fetchDocument: vi.fn(async () => ({
      url: 'https://docs.slack.dev/oauth',
      title: 'Actual fetched page',
      text: 'Slack uses OAuth 2.0. Configure scopes and redirect URLs. Review is conditional for distribution.',
    })),
  };
});
import { fetchDocument } from '@/lib/research/network';
import { retrieve, identityCandidates } from '@/lib/research/retrieval';
describe('Retained retrieval provenance', () => {
  it('does not confer provider authority on community-authored pages', async () => {
    vi.mocked(fetchDocument).mockResolvedValueOnce({
      url: 'https://community.slack.com/oauth',
      title: 'Forum',
      text: 'A user says OAuth review is optional.',
    });
    const result = await retrieve(
      [{ title: 'Forum', url: 'https://community.slack.com/oauth', content: '' }],
      'slack.com',
    );
    expect(result.sources[0].authority).toBe('third_party');
    expect(result.sources[0].type).toBe('third_party');
  });
  it('uses the fetched page instead of a stale search snippet and retains cross-domain authority provenance', async () => {
    const result = await retrieve(
      [
        {
          title: 'Old title',
          url: 'https://api.slack.com/old',
          content: 'Stale search snippet claiming approval is never required.',
        },
      ],
      'slack.com',
    );
    const source = result.sources[0];
    expect(source.summary).toContain('Slack uses OAuth');
    expect(source.summary).not.toContain('never required');
    expect(source.content).toBe(source.text);
    expect(source.originalUrl).toBe('https://api.slack.com/old');
    expect(source.url).toBe('https://docs.slack.dev/oauth');
    expect(source.contentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(source.authority).toBe('provider');
    expect(source.capture).toBe('fetched');
  });
});

describe('Provider identity candidates', () => {
  it('excludes aggregators and unrelated domains before identity synthesis', () => {
    const urls = [
      'https://en.wikipedia.org/wiki/Airtable',
      'https://datafetcher.com/airtable',
      'https://support.airtable.com/oauth',
      'https://airtable-evil.com/',
    ];
    expect(
      identityCandidates(
        urls.map((url) => ({ url, title: '', content: '' })),
        'Airtable',
      ).map((r) => r.url),
    ).toEqual(['https://support.airtable.com/oauth']);
    expect(
      identityCandidates(
        urls.map((url) => ({ url, title: '', content: '' })),
        'airtable.com',
      ).map((r) => r.url),
    ).toEqual(['https://support.airtable.com/oauth']);
  });
});
